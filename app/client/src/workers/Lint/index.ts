import { DataTree, DataTreeEntity } from "entities/DataTree/dataTreeFactory";
import { get, union } from "lodash";
import { EvaluationError, getDynamicBindings } from "utils/DynamicBindingUtils";
import {
  createGlobalData,
  EvaluationScriptType,
  getScriptToEval,
  getScriptType,
} from "workers/evaluate";
import {
  addErrorToEntityProperty,
  getEntityNameAndPropertyPath,
  isATriggerPath,
  isJSAction,
  removeLintErrorsFromEntityProperty,
} from "workers/evaluationUtils";

import { getJSToLint, getLintingErrors, pathRequiresLinting } from "./utils";

interface LintTreeArgs {
  extraPathsToLint: string[];
  unEvalTree: DataTree;
  evalTree: DataTree;
  sortedDependencies: string[];
}

export const lintTree = (args: LintTreeArgs) => {
  const { evalTree, extraPathsToLint, sortedDependencies, unEvalTree } = args;
  const GLOBAL_DATA_WITHOUT_FUNCTIONS = createGlobalData({
    dataTree: unEvalTree,
    resolvedFunctions: {},
    isTriggerBased: false,
  });
  // trigger paths
  const triggerPaths = new Set<string>();
  // Certain paths, like JS Object's body are binding paths where appsmith functions are needed in the global data
  const bindingPathsRequiringFunctions = new Set<string>();

  union(sortedDependencies, extraPathsToLint).forEach((fullPropertyPath) => {
    const { entityName, propertyPath } = getEntityNameAndPropertyPath(
      fullPropertyPath,
    );
    const entity = unEvalTree[entityName];
    const unEvalPropertyValue = (get(
      unEvalTree,
      fullPropertyPath,
    ) as unknown) as string;
    // remove all lint errors from path
    removeLintErrorsFromEntityProperty(evalTree, fullPropertyPath);
    // We are only interested in paths that require linting
    if (!pathRequiresLinting(unEvalTree, entity, fullPropertyPath)) return;
    if (isATriggerPath(entity, propertyPath))
      return triggerPaths.add(fullPropertyPath);
    if (isJSAction(entity))
      return bindingPathsRequiringFunctions.add(`${entityName}.body`);
    const lintErrors = lintBindingPath(
      unEvalPropertyValue,
      entity,
      fullPropertyPath,
      GLOBAL_DATA_WITHOUT_FUNCTIONS,
    );
    lintErrors.length &&
      addErrorToEntityProperty(lintErrors, evalTree, fullPropertyPath);
  });

  if (triggerPaths.size || bindingPathsRequiringFunctions.size) {
    // we only create GLOBAL_DATA_WITH_FUNCTIONS if there are paths requiring it
    // In trigger based fields, functions such as showAlert, storeValue, etc need to be added to the global data
    const GLOBAL_DATA_WITH_FUNCTIONS = createGlobalData({
      dataTree: unEvalTree,
      resolvedFunctions: {},
      isTriggerBased: true,
      skipEntityFunctions: true,
    });

    // lint binding paths that need GLOBAL_DATA_WITH_FUNCTIONS
    if (bindingPathsRequiringFunctions.size) {
      bindingPathsRequiringFunctions.forEach((fullPropertyPath) => {
        const { entityName } = getEntityNameAndPropertyPath(fullPropertyPath);
        const entity = unEvalTree[entityName];
        const unEvalPropertyValue = (get(
          unEvalTree,
          fullPropertyPath,
        ) as unknown) as string;
        // remove all lint errors from path
        removeLintErrorsFromEntityProperty(evalTree, fullPropertyPath);
        const lintErrors = lintBindingPath(
          unEvalPropertyValue,
          entity,
          fullPropertyPath,
          GLOBAL_DATA_WITH_FUNCTIONS,
        );
        lintErrors.length &&
          addErrorToEntityProperty(lintErrors, evalTree, fullPropertyPath);
      });
    }

    // Lint triggerPaths
    if (triggerPaths.size) {
      triggerPaths.forEach((triggerPath) => {
        const { entityName } = getEntityNameAndPropertyPath(triggerPath);
        const entity = unEvalTree[entityName];
        const unEvalPropertyValue = (get(
          unEvalTree,
          triggerPath,
        ) as unknown) as string;
        // remove all lint errors from path
        removeLintErrorsFromEntityProperty(evalTree, triggerPath);
        const lintErrors = lintTriggerPath(
          unEvalPropertyValue,
          entity,
          GLOBAL_DATA_WITH_FUNCTIONS,
        );
        lintErrors.length &&
          addErrorToEntityProperty(lintErrors, evalTree, triggerPath);
      });
    }
  }
};

const lintBindingPath = (
  dynamicBinding: string,
  entity: DataTreeEntity,
  fullPropertyPath: string,
  globalData: ReturnType<typeof createGlobalData>,
) => {
  let lintErrors: EvaluationError[] = [];
  const { propertyPath } = getEntityNameAndPropertyPath(fullPropertyPath);
  // Get the {{binding}} bound values
  const { jsSnippets, stringSegments } = getDynamicBindings(
    dynamicBinding,
    entity,
  );

  if (stringSegments) {
    jsSnippets.forEach((jsSnippet, index) => {
      const jsSnippetToLint = getJSSnippetToLint(
        entity,
        jsSnippet,
        propertyPath,
      );

      if (jsSnippet) {
        const jsSnippetToLint = getJSToLint(entity, jsSnippet, propertyPath);
        // {{user's code}}
        const originalBinding = getJSToLint(
          entity,
          stringSegments[index],
          propertyPath,
        );
        const scriptType = getScriptType(false, false);
        const scriptToLint = getScriptToEval(jsSnippetToLint, scriptType);
        const lintErrorsFromSnippet = getLintingErrors(
          scriptToLint,
          globalData,
          originalBinding,
          scriptType,
        );
        lintErrors = lintErrors.concat(lintErrorsFromSnippet);
      }
    });
  }
  return lintErrors;
};

const lintTriggerPath = (
  userScript: string,
  entity: DataTreeEntity,
  globalData: ReturnType<typeof createGlobalData>,
) => {
  const { jsSnippets } = getDynamicBindings(userScript, entity);
  const script = getScriptToEval(jsSnippets[0], EvaluationScriptType.TRIGGERS);

  return getLintingErrors(
    script,
    globalData,
    jsSnippets[0],
    EvaluationScriptType.TRIGGERS,
  );
};

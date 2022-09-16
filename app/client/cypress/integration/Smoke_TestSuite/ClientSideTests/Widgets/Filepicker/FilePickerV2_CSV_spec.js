const commonlocators = require("../../../../../locators/commonlocators.json");
const dsl = require("../../../../../fixtures/filePickerTableDSL.json");

const widgetName = "filepickerwidgetv2";

describe("File picker widget v2", () => {
  before(() => {
    cy.addDsl(dsl);
  });

  it("1. Parse CSV data to table Widget", () => {
    cy.openPropertyPane(widgetName);
    cy.selectDropdownValue(
      commonlocators.filePickerDataFormat,
      "Array (CSVs only)",
    );
    cy.get(commonlocators.filePickerDataFormat)
      .last()
      .should("have.text", "Array (CSVs only)");
    cy.get(commonlocators.filePickerInput)
      .first()
      .attachFile("Test csv.csv");
    cy.wait(3000);

    cy.readTableV2dataPublish("1", "1").then((tabData) => {
      const tabValue = tabData;
      expect(tabValue).to.be.equal("Black");
      cy.log("the value is" + tabValue);
    });
    cy.readTableV2dataPublish("1", "2").then((tabData) => {
      const tabValue = tabData;
      expect(tabValue).to.be.equal("1000");
      cy.log("the value is" + tabValue);
    });
    cy.readTableV2dataPublish("1", "3").then((tabData) => {
      const tabValue = tabData;
      expect(tabValue).to.be.equal("false");
      cy.log("the value is" + tabValue);
    });
  });
});

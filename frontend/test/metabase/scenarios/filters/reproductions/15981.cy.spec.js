import {
  restore,
  mockSessionProperty,
  openNativeEditor,
} from "__support__/e2e/cypress";

import * as SQLFilter from "../helpers/e2e-sql-filter-helpers";

["off", "on"].forEach(testCase => {
  const isFeatureFlagTurnedOn = testCase === "off" ? false : true;

  describe("issue 15981", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      mockSessionProperty(
        "field-filter-operators-enabled?",
        isFeatureFlagTurnedOn,
      );

      openNativeEditor();

      cy.intercept("POST", "/api/dataset").as("dataset");
    });

    it(`"Text" filter should work with the feature flag turned ${testCase} (metabase#15981-1)`, () => {
      SQLFilter.enterParameterizedQuery(
        "select * from PRODUCTS where CATEGORY = {{text_filter}}",
      );

      SQLFilter.setWidgetValue("Gizmo");

      SQLFilter.runQuery();

      cy.get(".Visualization").contains("Rustic Paper Wallet");

      cy.icon("contract").click();
      cy.findByText("Showing 51 rows");
      cy.icon("play").should("not.exist");
    });

    it(`"Number" filter should work with the feature flag turned ${testCase} (metabase#15981-2)`, () => {
      SQLFilter.enterParameterizedQuery(
        "select * from ORDERS where QUANTITY = {{number_filter}}",
      );

      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Number");

      SQLFilter.setWidgetValue("20");

      SQLFilter.runQuery();

      cy.get(".Visualization").contains("23.54");
    });
  });
});

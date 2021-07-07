import {
  restore,
  mockSessionProperty,
  openNativeEditor,
} from "__support__/e2e/cypress";

import * as SQLFilter from "../helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "../helpers/e2e-field-filter-helpers";

["old", "new"].forEach(test => {
  const isFeatureFlagTurnedOn = test === "old" ? false : true;
  const widgetType = test === "old" ? "Category" : "String is not";

  describe("issue 15700", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      mockSessionProperty(
        "field-filter-operators-enabled?",
        isFeatureFlagTurnedOn,
      );
    });

    it(`${test} syntax:\n should be able to select "Field Filter" category in native query (metabase#15700)`, () => {
      openNativeEditor();
      SQLFilter.enterParameterizedQuery("{{filter}}");

      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");

      FieldFilter.mapTo({
        table: "Products",
        field: "Category",
      });

      FieldFilter.setWidgetType(widgetType);
    });
  });
});

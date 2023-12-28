import { restore, openNativeEditor } from "e2e/support/helpers";

import * as SQLFilter from "../helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "../helpers/e2e-field-filter-helpers";

const widgetType = "String is not";

describe("issue 15700", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be able to select 'Field Filter' category in native query (metabase#15700)", () => {
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

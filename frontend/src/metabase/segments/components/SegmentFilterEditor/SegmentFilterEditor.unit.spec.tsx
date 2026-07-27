import userEvent from "@testing-library/user-event";

import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  PRODUCTS_ID,
  PRODUCT_CATEGORY_VALUES,
} from "metabase-types/api/mocks/presets";

import { SegmentFilterEditor } from "./SegmentFilterEditor";

function createQueryWithCategoryFilter() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: PRODUCTS_ID },
        filters: [
          {
            type: "operator",
            operator: "=",
            args: [
              { type: "column", sourceName: "PRODUCTS", name: "CATEGORY" },
              { type: "literal", value: "Gadget" },
              { type: "literal", value: "Widget" },
            ],
          },
        ],
      },
    ],
  });
}

describe("SegmentFilterEditor", () => {
  it("can show and inspect detailed read-only filter values", async () => {
    const user = userEvent.setup();
    setupFieldsValuesEndpoints([PRODUCT_CATEGORY_VALUES]);

    renderWithProviders(
      <SegmentFilterEditor
        query={createQueryWithCategoryFilter()}
        onChange={jest.fn()}
        readOnly
        detailedFilterNames
        inspectableFilters
      />,
    );

    await user.click(screen.getByText("Category is one of Gadget, Widget"));

    expect(
      await screen.findByTestId("string-filter-picker"),
    ).toBeInTheDocument();
    expect(screen.getByText("Gadget")).toBeInTheDocument();
    expect(screen.getByText("Widget")).toBeInTheDocument();
  });
});

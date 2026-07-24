import userEvent from "@testing-library/user-event";

import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  ORDERS_ID,
  REVIEWS_ID,
  SAMPLE_DB_FIELD_VALUES,
} from "metabase-types/api/mocks/presets";

import { FilterColumnPicker } from "./FilterColumnPicker";

interface SetupOpts {
  query: Lib.Query;
  stageIndexes: number[];
}

function setup({ query, stageIndexes }: SetupOpts) {
  const onColumnSelect = jest.fn();
  setupFieldsValuesEndpoints(SAMPLE_DB_FIELD_VALUES);
  renderWithProviders(
    <FilterColumnPicker
      query={query}
      stageIndexes={stageIndexes}
      checkItemIsSelected={() => false}
      onColumnSelect={onColumnSelect}
      onSegmentSelect={jest.fn()}
      onExpressionSelect={jest.fn()}
    />,
  );
  return { onColumnSelect };
}

describe("FilterColumnPicker", () => {
  test("The info icon should exist on each column", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const stageIndexes = [0];
    setup({ query, stageIndexes });
    expect(screen.getAllByLabelText("More info").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("Searching by displayName should work (#39622)", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const stageIndexes = [0];
    setup({ query, stageIndexes });

    await userEvent.click(screen.getByText("User"));
    await userEvent.type(screen.getByTestId("list-search-field"), "Birth Date");

    expect(
      await screen.findByRole("option", { name: "Birth Date" }),
    ).toBeInTheDocument();
  });

  it("should show FK-only joined groups as distinct, selectable groups (metabase#45300)", async () => {
    // Reviews joined to Orders on PRODUCT_ID = PRODUCT_ID (FK-only join).
    // This produces two column groups that both display as "Product"
    // (Reviews → Product and the joined Orders → Product). They must remain
    // distinct entries so the picker is not broken.
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: REVIEWS_ID },
          joins: [
            {
              source: { type: "table", id: ORDERS_ID },
              strategy: "left-join",
              conditions: [
                {
                  operator: "=",
                  left: { type: "column", name: "PRODUCT_ID" },
                  right: { type: "column", name: "PRODUCT_ID" },
                },
              ],
            },
          ],
        },
      ],
    });
    const { onColumnSelect } = setup({ query, stageIndexes: [0] });

    const productGroups = screen.getAllByText("Product");
    expect(productGroups).toHaveLength(2);

    await userEvent.click(productGroups[0]);
    await userEvent.click(screen.getByText("Category"));

    expect(onColumnSelect).toHaveBeenCalledTimes(1);
    const selectedItem = onColumnSelect.mock.calls[0][0];
    expect(
      Lib.displayInfo(query, selectedItem.stageIndex, selectedItem.column)
        .longDisplayName,
    ).toBe("Product → Category");
  });
});

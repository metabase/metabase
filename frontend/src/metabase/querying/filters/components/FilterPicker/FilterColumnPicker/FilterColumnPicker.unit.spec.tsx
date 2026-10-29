import userEvent from "@testing-library/user-event";

import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  ORDERS_ID,
  REVIEWS_ID,
  SAMPLE_DB_FIELD_VALUES,
} from "metabase-types/api/mocks/presets";

import type { ColumnListItem } from "../types";

import { FilterColumnPicker } from "./FilterColumnPicker";

interface SetupOpts {
  query: Lib.Query;
  stageIndexes: number[];
}

function setup({ query, stageIndexes }: SetupOpts) {
  const onColumnSelect = jest.fn<void, [ColumnListItem]>();
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

  it("should keep column groups with the same name apart (metabase#45300)", async () => {
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

    expect(screen.getAllByText("Product")).toHaveLength(2);

    await userEvent.click(screen.getAllByText("Product")[0]);
    await userEvent.click(
      within(await screen.findByRole("option", { name: "Category" })).getByText(
        "Category",
      ),
    );
    await userEvent.click(screen.getAllByText("Product")[1]);
    await userEvent.click(
      within(await screen.findByRole("option", { name: "Category" })).getByText(
        "Category",
      ),
    );

    const getColumnRef = (column: Lib.ColumnMetadata) =>
      Lib.legacyRef(query, 0, column);
    const expectedColumnRefs = Lib.groupColumns(Lib.filterableColumns(query, 0))
      .filter(
        (group) => Lib.displayInfo(query, 0, group).displayName === "Product",
      )
      .map((group) =>
        Lib.getColumnsFromColumnGroup(group).find(
          (column) => Lib.displayInfo(query, 0, column).name === "CATEGORY",
        ),
      )
      .map((column) => column && getColumnRef(column));

    expect(expectedColumnRefs).toHaveLength(2);
    expect(expectedColumnRefs[0]).not.toEqual(expectedColumnRefs[1]);
    expect(
      onColumnSelect.mock.calls.map(([item]) => getColumnRef(item.column)),
    ).toEqual(expectedColumnRefs);
  });
});

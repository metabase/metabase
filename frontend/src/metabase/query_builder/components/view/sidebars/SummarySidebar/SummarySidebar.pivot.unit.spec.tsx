import userEvent from "@testing-library/user-event";

import { fireEvent, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { TestAggregationSpec } from "metabase-types/api";
import { ORDERS, ORDERS_ID } from "metabase-types/api/mocks/presets";

import {
  COUNT,
  STAGE_INDEX,
  SUM_OF_TOTAL,
  createQueryWithMetric,
  drop,
  endDrag,
  getChipLabels,
  getFieldButton,
  getFieldDrag,
  setup,
  startDrag,
} from "./tests/setup";
import type { SummaryWellId } from "./types";
import { getDimensionItems } from "./utils";

describe("SummarySidebar", () => {
  describe("pivot mode", () => {
    const getWell = (wellId: SummaryWellId) =>
      within(screen.getByTestId(`summary-well-${wellId}`));

    async function pickOption(name: string) {
      const options = await screen.findAllByRole("option");
      const option = options.find((option) => option.textContent === name);
      expect(option).toBeDefined();
      if (option) {
        await userEvent.click(option);
      }
    }

    async function pickInRows(searchText: string, name: string) {
      await userEvent.type(
        screen.getByLabelText("Add a row by name"),
        searchText,
      );
      await pickOption(name);
    }

    it("switches to the Values, Columns, and Rows wells from the pivot toggle, and back", async () => {
      const { onQueryChange } = setup();

      await userEvent.click(
        screen.getByRole("button", { name: "Pivot into rows and columns" }),
      );

      expect(getWell("values").getByText("Values")).toBeInTheDocument();
      expect(getWell("columns").getByText("Columns")).toBeInTheDocument();
      expect(getWell("rows").getByText("Rows")).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Back to breakouts" }),
      );

      expect(getWell("values").getByText("Summarize by")).toBeInTheDocument();
      expect(getWell("columns").getByText("Group by")).toBeInTheDocument();
      expect(screen.queryByTestId("summary-well-rows")).not.toBeInTheDocument();
      expect(onQueryChange).not.toHaveBeenCalled();
    });

    it("puts a grouping that is picked in Rows in the Rows well", async () => {
      const { getLastQuery } = setup();
      await userEvent.click(
        screen.getByRole("button", { name: "Pivot into rows and columns" }),
      );

      await pickInRows("categ", "Category");

      expect(getLastQuery()).toEqual({
        values: ["Count"],
        dimensions: ["Product → Category"],
      });
      expect(getChipLabels("rows")).toEqual(["Product → Category"]);
      expect(getChipLabels("columns")).toEqual([]);

      fireEvent.click(getFieldButton("Product", "Vendor"), { altKey: true });

      expect(getChipLabels("rows")).toEqual(["Product → Category"]);
      expect(getChipLabels("columns")).toEqual(["Product → Vendor"]);
    });

    it("replaces only the Columns groupings on a field click", async () => {
      setup();
      await userEvent.click(
        screen.getByRole("button", { name: "Pivot into rows and columns" }),
      );
      await pickInRows("categ", "Category");

      await userEvent.click(getFieldButton("Product", "Vendor"));
      await userEvent.click(getFieldButton("Orders", "Created At"));

      expect(getChipLabels("rows")).toEqual(["Product → Category"]);
      expect(getChipLabels("columns")).toEqual(["Created At: Month"]);
    });

    it("clears all the wells when Clear all is clicked", async () => {
      const { getLastQuery } = setup({
        query: Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations: [{ type: "operator", operator: "count" }],
              breakouts: [
                { type: "column", name: "CREATED_AT", unit: "month" },
              ],
            },
          ],
        }),
      });
      await userEvent.click(
        screen.getByRole("button", { name: "Pivot into rows and columns" }),
      );
      await pickInRows("categ", "Category");

      await userEvent.click(screen.getByRole("button", { name: "Clear all" }));

      expect(getLastQuery()).toEqual({ values: [], dimensions: [] });
      expect(getChipLabels("values")).toEqual([]);
      expect(getChipLabels("columns")).toEqual([]);
      expect(getChipLabels("rows")).toEqual([]);
      expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
    });

    describe("drag and drop", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count" }],
            breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
          },
        ],
      });
      const [createdAt] = getDimensionItems(query, STAGE_INDEX);

      it("adds a field that is dropped on Rows to the Rows well", async () => {
        const { getLastQuery } = setup({ query });
        await userEvent.click(
          screen.getByRole("button", { name: "Pivot into rows and columns" }),
        );

        drop(getFieldDrag(query, "Product", "Category"), "rows");

        expect(getLastQuery().dimensions).toEqual([
          "Created At: Month",
          "Product → Category",
        ]);
        expect(getChipLabels("columns")).toEqual(["Created At: Month"]);
        expect(getChipLabels("rows")).toEqual(["Product → Category"]);
      });

      it("moves a grouping chip between Columns and Rows without a change of the query", async () => {
        const { onQueryChange, getLastPivotChange } = setup({ query });
        await userEvent.click(
          screen.getByRole("button", { name: "Pivot into rows and columns" }),
        );

        drop({ kind: "dimension", item: createdAt, wellId: "columns" }, "rows");
        expect(getChipLabels("columns")).toEqual([]);
        expect(getChipLabels("rows")).toEqual(["Created At: Month"]);
        expect(getLastPivotChange()).toEqual({
          type: "show",
          columnSplit: { rows: ["CREATED_AT"], columns: [], values: ["count"] },
        });

        drop({ kind: "dimension", item: createdAt, wellId: "rows" }, "columns");
        expect(getChipLabels("columns")).toEqual(["Created At: Month"]);
        expect(getChipLabels("rows")).toEqual([]);
        expect(getLastPivotChange()).toEqual({ type: "hide" });
        expect(
          onQueryChange.mock.calls.every(([nextQuery]) => nextQuery === query),
        ).toBe(true);
      });

      it("offers to create a pivot while a column is dragged outside the pivot mode", () => {
        const metricQuery = createQueryWithMetric();
        setup({ query: metricQuery });
        expect(screen.queryByText("Create pivot")).not.toBeInTheDocument();

        startDrag(getFieldDrag(metricQuery, "Metrics", "Revenue"));
        expect(screen.queryByText("Create pivot")).not.toBeInTheDocument();
        endDrag(null);

        startDrag(getFieldDrag(metricQuery, "Product", "Category"));
        expect(screen.getByText("Create pivot")).toBeInTheDocument();
        endDrag(null);
        expect(screen.queryByText("Create pivot")).not.toBeInTheDocument();
      });

      it("starts the pivot mode on a drop below the wells and ends it when Rows is empty", async () => {
        setup({ query });

        drop({ kind: "dimension", item: createdAt, wellId: "columns" }, "rows");

        expect(getWell("columns").getByText("Columns")).toBeInTheDocument();
        expect(getChipLabels("rows")).toEqual(["Created At: Month"]);
        expect(
          screen.getByRole("button", { name: "Back to breakouts" }),
        ).toBeInTheDocument();

        await userEvent.click(
          screen.getByRole("button", { name: "Remove Created At: Month" }),
        );

        expect(
          screen.queryByTestId("summary-well-rows"),
        ).not.toBeInTheDocument();
        expect(getWell("columns").getByText("Group by")).toBeInTheDocument();
      });

      it("moves the focus to the Columns field when Backspace ends the pivot mode that a drop started", async () => {
        setup({ query });
        drop({ kind: "dimension", item: createdAt, wellId: "columns" }, "rows");

        await userEvent.click(screen.getByLabelText("Add a row by name"));
        await userEvent.keyboard("{Backspace}");

        expect(
          screen.queryByTestId("summary-well-rows"),
        ).not.toBeInTheDocument();
        expect(screen.getByLabelText("Add a grouping by name")).toHaveFocus();
      });

      it("keeps a held Backspace from removing the Columns groupings once it ends the pivot mode that a drop started", async () => {
        const queryWithCategory = Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations: [{ type: "operator", operator: "count" }],
              breakouts: [
                { type: "column", name: "CREATED_AT", unit: "month" },
                {
                  type: "column",
                  sourceFieldId: ORDERS.PRODUCT_ID,
                  name: "CATEGORY",
                },
              ],
            },
          ],
        });
        const [createdAtGrouping] = getDimensionItems(
          queryWithCategory,
          STAGE_INDEX,
        );
        setup({ query: queryWithCategory });
        drop(
          { kind: "dimension", item: createdAtGrouping, wellId: "columns" },
          "rows",
        );

        await userEvent.click(screen.getByLabelText("Add a row by name"));
        await userEvent.keyboard("{Backspace}");
        const columnsField = screen.getByLabelText("Add a grouping by name");
        expect(columnsField).toHaveFocus();
        fireEvent.keyDown(columnsField, { key: "Backspace", repeat: true });

        expect(getChipLabels("columns")).toEqual(["Product → Category"]);
      });

      it("moves the focus to the Columns field when the Remove button ends the pivot mode that a drop started", async () => {
        setup({ query });
        drop({ kind: "dimension", item: createdAt, wellId: "columns" }, "rows");

        screen
          .getByRole("button", { name: "Remove Created At: Month" })
          .focus();
        await userEvent.keyboard("{Enter}");

        expect(
          screen.queryByTestId("summary-well-rows"),
        ).not.toBeInTheDocument();
        expect(screen.getByLabelText("Add a grouping by name")).toHaveFocus();
      });

      it("keeps the focus in the Rows field when Backspace empties the Rows of the pivot mode that the toggle started", async () => {
        setup({ query });
        await userEvent.click(
          screen.getByRole("button", { name: "Pivot into rows and columns" }),
        );
        drop({ kind: "dimension", item: createdAt, wellId: "columns" }, "rows");

        await userEvent.click(screen.getByLabelText("Add a row by name"));
        await userEvent.keyboard("{Backspace}");

        expect(getChipLabels("rows")).toEqual([]);
        expect(screen.getByLabelText("Add a row by name")).toHaveFocus();
      });

      it("keeps the pivot mode that the toggle started when Rows is empty", async () => {
        setup({ query });
        await userEvent.click(
          screen.getByRole("button", { name: "Pivot into rows and columns" }),
        );
        drop({ kind: "dimension", item: createdAt, wellId: "columns" }, "rows");

        await userEvent.click(
          screen.getByRole("button", { name: "Remove Created At: Month" }),
        );

        expect(getChipLabels("rows")).toEqual([]);
        expect(getWell("columns").getByText("Columns")).toBeInTheDocument();
      });
    });

    it("moves the Rows groupings to Group by when the pivot mode ends", async () => {
      const { onQueryChange } = setup();
      await userEvent.click(
        screen.getByRole("button", { name: "Pivot into rows and columns" }),
      );
      await pickInRows("categ", "Category");
      const [[queryWithRows]] = onQueryChange.mock.calls.slice(-1);

      await userEvent.click(
        screen.getByRole("button", { name: "Back to breakouts" }),
      );

      expect(getChipLabels("columns")).toEqual(["Product → Category"]);
      expect(onQueryChange).toHaveBeenLastCalledWith(queryWithRows, {
        type: "hide",
      });
    });

    describe("pivot table question", () => {
      const createQuery = (aggregations: TestAggregationSpec[]) =>
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations,
              breakouts: [
                { type: "column", name: "CREATED_AT", unit: "month" },
                {
                  type: "column",
                  sourceFieldId: ORDERS.PRODUCT_ID,
                  name: "CATEGORY",
                },
                {
                  type: "column",
                  sourceFieldId: ORDERS.PRODUCT_ID,
                  name: "VENDOR",
                },
              ],
            },
          ],
        });
      const query = createQuery([COUNT]);
      const pivotColumnSplit = {
        rows: ["VENDOR", "CREATED_AT"],
        columns: ["CATEGORY"],
        values: ["count"],
      };

      it("opens in pivot mode with the Rows of the question, in their order", () => {
        const { onQueryChange } = setup({ query, pivotColumnSplit });

        expect(getWell("values").getByText("Values")).toBeInTheDocument();
        expect(getChipLabels("rows")).toEqual([
          "Product → Vendor",
          "Created At: Month",
        ]);
        expect(getChipLabels("columns")).toEqual(["Product → Category"]);
        expect(onQueryChange).not.toHaveBeenCalled();
      });

      it("keeps the other Rows when a Rows grouping is removed", async () => {
        const { getLastPivotChange } = setup({ query, pivotColumnSplit });

        await userEvent.click(
          screen.getByRole("button", { name: "Remove Product → Vendor" }),
        );

        expect(getLastPivotChange()).toEqual({
          type: "show",
          columnSplit: {
            rows: ["CREATED_AT"],
            columns: ["CATEGORY"],
            values: ["count"],
          },
        });
        expect(getChipLabels("rows")).toEqual(["Created At: Month"]);
      });

      it("keeps the order of the Columns and Values of the question when a value is added", async () => {
        const { getLastPivotChange } = setup({
          query: createQuery([COUNT, SUM_OF_TOTAL]),
          pivotColumnSplit: {
            rows: ["CREATED_AT"],
            columns: ["VENDOR", "CATEGORY"],
            values: ["sum", "count"],
          },
        });
        expect(getChipLabels("values")).toEqual(["Sum of Total", "Count"]);
        expect(getChipLabels("columns")).toEqual([
          "Product → Vendor",
          "Product → Category",
        ]);

        await userEvent.type(
          screen.getByLabelText("Add a value by name"),
          "quant",
        );
        await pickOption("Quantity");

        expect(getLastPivotChange()).toEqual({
          type: "show",
          columnSplit: {
            rows: ["CREATED_AT"],
            columns: ["VENDOR", "CATEGORY"],
            values: ["sum", "count", "sum_2"],
          },
        });
      });

      it("leaves the pivot mode when the question stops showing a pivot table", async () => {
        setup({ query, pivotColumnSplit });

        await userEvent.click(
          screen.getByRole("button", {
            name: "Go back to a non-pivot question",
          }),
        );

        expect(
          screen.queryByTestId("summary-well-rows"),
        ).not.toBeInTheDocument();
        expect(getChipLabels("columns")).toHaveLength(3);
      });
    });

    describe("when a pivot table is not possible", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count" }],
            breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
          },
        ],
      });

      it("offers no way into the pivot mode", () => {
        setup({ query, canPivot: false });

        expect(
          screen.queryByRole("button", { name: "Pivot into rows and columns" }),
        ).not.toBeInTheDocument();

        startDrag(getFieldDrag(query, "Product", "Category"));
        expect(screen.queryByText("Create pivot")).not.toBeInTheDocument();
        endDrag(null);
      });

      it("shows the Rows of a pivot table question as plain groupings", () => {
        setup({
          query,
          canPivot: false,
          pivotColumnSplit: {
            rows: ["CREATED_AT"],
            columns: [],
            values: ["count"],
          },
        });

        expect(
          screen.queryByTestId("summary-well-rows"),
        ).not.toBeInTheDocument();
        expect(getWell("columns").getByText("Group by")).toBeInTheDocument();
        expect(getChipLabels("columns")).toEqual(["Created At: Month"]);
      });
    });

    it("shows a pivot table while Values and Rows have items", async () => {
      const { getLastPivotChange } = setup();
      await userEvent.click(getFieldButton("Product", "Vendor"));
      expect(getLastPivotChange()).toBeUndefined();

      await userEvent.click(
        screen.getByRole("button", { name: "Pivot into rows and columns" }),
      );
      await pickInRows("categ", "Category");
      expect(getLastPivotChange()).toEqual({
        type: "show",
        columnSplit: {
          rows: ["CATEGORY"],
          columns: ["VENDOR"],
          values: ["count"],
        },
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Remove Count" }),
      );
      expect(getLastPivotChange()).toEqual({ type: "hide" });
      expect(getChipLabels("rows")).toEqual(["Product → Category"]);
    });
  });
});

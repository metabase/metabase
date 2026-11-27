import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { fireEvent, screen } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { trackSummarySidebarOpened } from "./analytics";
import {
  COUNT,
  SUMMARIZED_QUERY,
  drop,
  getChipLabels,
  getFieldButton,
  getFieldDrag,
  setup,
} from "./tests/setup";
import { getDimensionItems, getValueItems } from "./utils";

const EMPTY_QUERY = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);

const TWO_GROUPINGS_QUERY = Lib.createTestQuery(SAMPLE_PROVIDER, {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      aggregations: [COUNT],
      breakouts: [
        { type: "column", name: "CREATED_AT", unit: "month" },
        { type: "column", sourceFieldId: ORDERS.PRODUCT_ID, name: "CATEGORY" },
      ],
    },
  ],
});

const FORMULA_QUERY = Lib.createTestQuery(SAMPLE_PROVIDER, {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      expressions: [
        { name: "Next day", value: { type: "column", name: "CREATED_AT" } },
      ],
      aggregations: [
        {
          name: "Revenue",
          value: {
            type: "operator",
            operator: "sum",
            args: [{ type: "column", name: "TOTAL" }],
          },
        },
      ],
      breakouts: [{ type: "column", name: "Next day", unit: "month" }],
    },
  ],
});

function setupTracking() {
  return jest.spyOn(Analytics, "trackSimpleEvent").mockClear();
}

async function pickOption(
  inputLabel: string,
  searchText: string,
  name: string,
) {
  await userEvent.type(screen.getByLabelText(inputLabel), searchText);
  const options = await screen.findAllByRole("option");
  const option = options.find((option) => option.textContent === name);
  if (!option) {
    throw new Error(`No ${name} option`);
  }
  await userEvent.click(option);
}

async function renameChip(label: string, name: string, typedText: string) {
  await userEvent.dblClick(screen.getByText(label));
  const input = screen.getByRole("textbox", { name: `Rename ${name}` });
  await userEvent.clear(input);
  await userEvent.type(input, typedText);
}

function createQuestion(query: Lib.Query, id?: number) {
  return new Question(
    createMockCard({ id, dataset_query: Lib.toJsQuery(query) }),
    createMockMetadata({ databases: [createSampleDatabase()] }),
  );
}

describe("SummarySidebar analytics", () => {
  describe("summary_sidebar_opened", () => {
    it("reports an unsummarized ad-hoc question as empty, with no target", () => {
      const trackSimpleEvent = setupTracking();

      trackSummarySidebarOpened(
        createQuestion(EMPTY_QUERY).setId(undefined),
        "summarize_button",
      );

      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "summary_sidebar_opened",
        triggered_from: "summarize_button",
        event_detail: "empty",
        target_id: null,
      });
    });

    it("reports a summarized saved question with its id", () => {
      const trackSimpleEvent = setupTracking();

      trackSummarySidebarOpened(
        createQuestion(SUMMARIZED_QUERY, 7),
        "column_header",
      );

      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "summary_sidebar_opened",
        triggered_from: "column_header",
        event_detail: "summarized",
        target_id: 7,
      });
    });
  });

  describe("summary_field_added", () => {
    it("tracks a field picked in the typeahead of a well", async () => {
      const trackSimpleEvent = setupTracking();
      setup();

      await pickOption("Add a grouping by name", "categ", "Category");

      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "summary_field_added",
        triggered_from: "columns",
        event_detail: "typeahead",
      });
    });

    it("tracks a click and an alt-click in the field list", async () => {
      const trackSimpleEvent = setupTracking();
      setup();

      await userEvent.click(getFieldButton("Product", "Category"));
      expect(trackSimpleEvent).toHaveBeenLastCalledWith({
        event: "summary_field_added",
        triggered_from: "columns",
        event_detail: "field_list_click",
      });

      fireEvent.click(getFieldButton("Orders", "Created At"), { altKey: true });
      expect(trackSimpleEvent).toHaveBeenLastCalledWith({
        event: "summary_field_added",
        triggered_from: "columns",
        event_detail: "field_list_alt_click",
      });
      expect(trackSimpleEvent).toHaveBeenCalledTimes(2);
    });

    it("tracks a field dropped on a well, with the well it lands in", () => {
      const trackSimpleEvent = setupTracking();
      setup();

      drop(getFieldDrag(EMPTY_QUERY, "Orders", "Total"), "values");

      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "summary_field_added",
        triggered_from: "values",
        event_detail: "drag_and_drop",
      });
    });

    it("doesn't track a pick that leaves the summary as it is", async () => {
      const trackSimpleEvent = setupTracking();
      const { onQueryChange } = setup({ query: SUMMARIZED_QUERY });

      await pickOption("Add a value by name", "count", "Count of rows");

      expect(onQueryChange).not.toHaveBeenCalled();
      expect(trackSimpleEvent).not.toHaveBeenCalled();
    });

    it("doesn't track a chip moved from one well to another", () => {
      const trackSimpleEvent = setupTracking();
      const { onQueryChange } = setup({ query: SUMMARIZED_QUERY });
      const [, sumOfTotal] = getValueItems(SUMMARIZED_QUERY, -1);

      drop({ kind: "value", item: sumOfTotal }, "columns");

      expect(onQueryChange).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).not.toHaveBeenCalled();
    });

    it("tracks a field list click that swaps the chips of the well for a new field", async () => {
      const trackSimpleEvent = setupTracking();
      setup({ query: TWO_GROUPINGS_QUERY });

      await userEvent.click(getFieldButton("Product", "Vendor"));

      expect(getChipLabels("columns")).toEqual(["Product → Vendor"]);
      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "summary_field_added",
        triggered_from: "columns",
        event_detail: "field_list_click",
      });
    });

    it("doesn't track a field list click that only takes the other chips off the well", async () => {
      const trackSimpleEvent = setupTracking();
      const { onQueryChange } = setup({ query: TWO_GROUPINGS_QUERY });

      await userEvent.click(getFieldButton("Orders", "Created At"));

      expect(getChipLabels("columns")).toEqual(["Created At: Month"]);
      expect(onQueryChange).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).not.toHaveBeenCalled();
    });
  });

  describe("summary_item_removed", () => {
    it("tracks a chip taken off with its remove button", async () => {
      const trackSimpleEvent = setupTracking();
      setup({ query: SUMMARIZED_QUERY });

      await userEvent.click(
        screen.getByRole("button", { name: "Remove Sum of Total" }),
      );

      expect(getChipLabels("values")).toEqual(["Count"]);
      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "summary_item_removed",
        triggered_from: "values",
        event_detail: "remove_button",
      });
    });

    it("tracks the last chip taken off with Backspace in the field of a well", async () => {
      const trackSimpleEvent = setupTracking();
      setup({ query: SUMMARIZED_QUERY });

      await userEvent.click(screen.getByLabelText("Add a grouping by name"));
      await userEvent.keyboard("{Backspace}");

      expect(getChipLabels("columns")).toEqual([]);
      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "summary_item_removed",
        triggered_from: "columns",
        event_detail: "backspace",
      });
    });

    it("tracks a chip taken off the Rows well of pivot mode", async () => {
      const trackSimpleEvent = setupTracking();
      setup({
        query: TWO_GROUPINGS_QUERY,
        pivotColumnSplit: {
          rows: ["CREATED_AT", "CATEGORY"],
          columns: [],
          values: ["count"],
        },
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Remove Product → Category" }),
      );

      expect(getChipLabels("rows")).toEqual(["Created At: Month"]);
      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "summary_item_removed",
        triggered_from: "rows",
        event_detail: "remove_button",
      });
    });

    it("doesn't track Backspace in a well with no chips", async () => {
      const trackSimpleEvent = setupTracking();
      const { onQueryChange } = setup();

      await userEvent.click(screen.getByLabelText("Add a value by name"));
      await userEvent.keyboard("{Backspace}");

      expect(onQueryChange).not.toHaveBeenCalled();
      expect(trackSimpleEvent).not.toHaveBeenCalled();
    });

    it("doesn't track the chips that Clear all takes off", async () => {
      const trackSimpleEvent = setupTracking();
      const { onQueryChange } = setup({ query: SUMMARIZED_QUERY });

      await userEvent.click(screen.getByRole("button", { name: "Clear all" }));

      expect(onQueryChange).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).not.toHaveBeenCalled();
    });
  });

  describe("summary_item_renamed", () => {
    it("tracks a renamed value", async () => {
      const trackSimpleEvent = setupTracking();
      setup({ query: FORMULA_QUERY });

      await renameChip("Revenue", "Revenue", "Income{Enter}");

      expect(getChipLabels("values")).toEqual(["Income"]);
      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "summary_item_renamed",
        triggered_from: "values",
      });
    });

    it("tracks a renamed grouping formula", async () => {
      const trackSimpleEvent = setupTracking();
      const { getLastQuery } = setup({ query: FORMULA_QUERY });

      await renameChip("Next day:", "Next day", "Day after{Enter}");

      expect(getLastQuery().dimensions).toEqual(["Day after: Month"]);
      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "summary_item_renamed",
        triggered_from: "columns",
      });
    });

    it("doesn't track a name that is dropped or left as it was", async () => {
      const trackSimpleEvent = setupTracking();
      const { onQueryChange } = setup({ query: FORMULA_QUERY });

      await renameChip("Revenue", "Revenue", "Income{Escape}");
      await renameChip("Revenue", "Revenue", "Revenue{Enter}");

      expect(onQueryChange).not.toHaveBeenCalled();
      expect(trackSimpleEvent).not.toHaveBeenCalled();
    });
  });

  describe("summary_pivot_mode_toggled", () => {
    const [createdAt] = getDimensionItems(SUMMARIZED_QUERY, -1);
    const PIVOT_SPLIT = {
      rows: ["CATEGORY"],
      columns: ["CREATED_AT"],
      values: ["count"],
    };

    function getPivotModeEvents(
      trackSimpleEvent: ReturnType<typeof setupTracking>,
    ) {
      return trackSimpleEvent.mock.calls
        .map(([event]) => event)
        .filter(({ event }) => event === "summary_pivot_mode_toggled");
    }

    it("tracks the pivot toggle turning the mode on and off", async () => {
      const trackSimpleEvent = setupTracking();
      setup();

      await userEvent.click(
        screen.getByRole("button", { name: "Pivot into rows and columns" }),
      );
      expect(trackSimpleEvent).toHaveBeenLastCalledWith({
        event: "summary_pivot_mode_toggled",
        triggered_from: "toggle_button",
        event_detail: "enabled",
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Back to breakouts" }),
      );
      expect(trackSimpleEvent).toHaveBeenLastCalledWith({
        event: "summary_pivot_mode_toggled",
        triggered_from: "toggle_button",
        event_detail: "disabled",
      });
      expect(trackSimpleEvent).toHaveBeenCalledTimes(2);
    });

    it("tracks the mode turned on by a chip dropped on Create pivot", () => {
      const trackSimpleEvent = setupTracking();
      setup({ query: SUMMARIZED_QUERY });

      drop({ kind: "dimension", item: createdAt, wellId: "columns" }, "rows");

      expect(getChipLabels("rows")).toEqual(["Created At: Month"]);
      expect(trackSimpleEvent.mock.calls).toEqual([
        [
          {
            event: "summary_pivot_mode_toggled",
            triggered_from: "rows_well",
            event_detail: "enabled",
          },
        ],
      ]);
    });

    it("tracks the mode turned on by a field dropped on Create pivot, with the field added", () => {
      const trackSimpleEvent = setupTracking();
      setup({ query: SUMMARIZED_QUERY });

      drop(getFieldDrag(SUMMARIZED_QUERY, "Product", "Category"), "rows");

      expect(getChipLabels("rows")).toEqual(["Product → Category"]);
      expect(trackSimpleEvent.mock.calls).toEqual([
        [
          {
            event: "summary_pivot_mode_toggled",
            triggered_from: "rows_well",
            event_detail: "enabled",
          },
        ],
        [
          {
            event: "summary_field_added",
            triggered_from: "rows",
            event_detail: "drag_and_drop",
          },
        ],
      ]);
    });

    it("tracks the mode turned off when the last Rows chip is removed", async () => {
      const trackSimpleEvent = setupTracking();
      setup({ query: TWO_GROUPINGS_QUERY, pivotColumnSplit: PIVOT_SPLIT });

      await userEvent.click(
        screen.getByRole("button", { name: "Remove Product → Category" }),
      );

      expect(screen.queryByTestId("summary-well-rows")).not.toBeInTheDocument();
      expect(getPivotModeEvents(trackSimpleEvent)).toEqual([
        {
          event: "summary_pivot_mode_toggled",
          triggered_from: "rows_well",
          event_detail: "disabled",
        },
      ]);
    });

    it("tracks the mode turned off when the last Rows chip is dragged to Columns", () => {
      const trackSimpleEvent = setupTracking();
      setup({ query: TWO_GROUPINGS_QUERY, pivotColumnSplit: PIVOT_SPLIT });
      const [, category] = getDimensionItems(TWO_GROUPINGS_QUERY, -1);

      drop({ kind: "dimension", item: category, wellId: "rows" }, "columns");

      expect(screen.queryByTestId("summary-well-rows")).not.toBeInTheDocument();
      expect(trackSimpleEvent.mock.calls).toEqual([
        [
          {
            event: "summary_pivot_mode_toggled",
            triggered_from: "rows_well",
            event_detail: "disabled",
          },
        ],
      ]);
    });

    it("tracks the mode turned off when Clear all empties Rows", async () => {
      const trackSimpleEvent = setupTracking();
      setup({ query: TWO_GROUPINGS_QUERY, pivotColumnSplit: PIVOT_SPLIT });

      await userEvent.click(screen.getByRole("button", { name: "Clear all" }));

      expect(screen.queryByTestId("summary-well-rows")).not.toBeInTheDocument();
      expect(trackSimpleEvent.mock.calls).toEqual([
        [
          {
            event: "summary_pivot_mode_toggled",
            triggered_from: "rows_well",
            event_detail: "disabled",
          },
        ],
      ]);
    });

    it("tracks the toggle once when it turns off a mode that has Rows chips", async () => {
      const trackSimpleEvent = setupTracking();
      setup({ query: TWO_GROUPINGS_QUERY, pivotColumnSplit: PIVOT_SPLIT });

      await userEvent.click(
        screen.getByRole("button", { name: "Back to breakouts" }),
      );

      expect(screen.queryByTestId("summary-well-rows")).not.toBeInTheDocument();
      expect(trackSimpleEvent.mock.calls).toEqual([
        [
          {
            event: "summary_pivot_mode_toggled",
            triggered_from: "toggle_button",
            event_detail: "disabled",
          },
        ],
      ]);
    });

    it("doesn't track the Rows well filling and emptying while the toggle keeps the mode on", async () => {
      const trackSimpleEvent = setupTracking();
      setup({ query: SUMMARIZED_QUERY });
      await userEvent.click(
        screen.getByRole("button", { name: "Pivot into rows and columns" }),
      );

      drop({ kind: "dimension", item: createdAt, wellId: "columns" }, "rows");
      await userEvent.click(
        screen.getByRole("button", { name: "Remove Created At: Month" }),
      );

      expect(screen.getByTestId("summary-well-rows")).toBeInTheDocument();
      expect(getPivotModeEvents(trackSimpleEvent)).toEqual([
        {
          event: "summary_pivot_mode_toggled",
          triggered_from: "toggle_button",
          event_detail: "enabled",
        },
      ]);
    });

    it("doesn't track a chip moved between Columns and Rows while Rows keeps a chip", () => {
      const trackSimpleEvent = setupTracking();
      setup({ query: TWO_GROUPINGS_QUERY, pivotColumnSplit: PIVOT_SPLIT });
      const [createdAt] = getDimensionItems(TWO_GROUPINGS_QUERY, -1);

      drop({ kind: "dimension", item: createdAt, wellId: "columns" }, "rows");

      expect(getChipLabels("rows")).toEqual([
        "Product → Category",
        "Created At: Month",
      ]);
      expect(trackSimpleEvent).not.toHaveBeenCalled();
    });

    it("doesn't track the mode ending because the question stopped showing a pivot table", async () => {
      const trackSimpleEvent = setupTracking();
      setup({ query: TWO_GROUPINGS_QUERY, pivotColumnSplit: PIVOT_SPLIT });

      await userEvent.click(
        screen.getByRole("button", { name: "Go back to a non-pivot question" }),
      );

      expect(screen.queryByTestId("summary-well-rows")).not.toBeInTheDocument();
      expect(trackSimpleEvent).not.toHaveBeenCalled();
    });
  });
});

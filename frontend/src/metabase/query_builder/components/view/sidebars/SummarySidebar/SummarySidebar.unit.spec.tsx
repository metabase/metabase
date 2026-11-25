import userEvent from "@testing-library/user-event";

import { fireEvent, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID, PRODUCTS_ID } from "metabase-types/api/mocks/presets";

import {
  STAGE_INDEX,
  SUMMARIZED_QUERY,
  createQueryWithMetric,
  drop,
  endDrag,
  getChipLabels,
  getFieldButton,
  getFieldDrag,
  setup,
  startDrag,
} from "./tests/setup";
import { getDimensionItems, getValueItems } from "./utils";

describe("SummarySidebar", () => {
  it("opens a bare query empty", () => {
    const { onQueryChange } = setup();

    expect(getChipLabels("values")).toEqual([]);
    expect(getChipLabels("columns")).toEqual([]);
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("lists the column of a binned grouping without the binning in its name (metabase#57697)", () => {
    setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: PRODUCTS_ID },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
            breakouts: [
              { type: "column", name: "CATEGORY" },
              {
                type: "column",
                name: "PRICE",
                binning: { strategy: "default" },
              },
            ],
          },
        ],
      }),
    });

    const fieldList = screen.getByTestId("summary-field-list");
    expect(within(fieldList).getByText("Price")).toBeInTheDocument();
    expect(
      within(fieldList).queryByText("Price: Auto binned"),
    ).not.toBeInTheDocument();
  });

  it("counts the rows once a grouping is added to a summary without values", async () => {
    const { onQueryChange, getLastQuery } = setup();

    await userEvent.click(getFieldButton("Product", "Category"));

    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(getLastQuery()).toEqual({
      values: ["Count"],
      dimensions: ["Product → Category"],
    });
    expect(getChipLabels("values")).toEqual(["Count"]);
    expect(getChipLabels("columns")).toEqual(["Product → Category"]);
  });

  it("keeps the values a summary already has when a grouping is added", async () => {
    const { getLastQuery } = setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [
              {
                type: "operator",
                operator: "sum",
                args: [{ type: "column", name: "TOTAL" }],
              },
            ],
          },
        ],
      }),
    });

    await userEvent.click(getFieldButton("Product", "Category"));
    expect(getLastQuery()).toEqual({
      values: ["Sum of Total"],
      dimensions: ["Product → Category"],
    });

    fireEvent.click(getFieldButton("Orders", "Created At"), { altKey: true });
    expect(getLastQuery().values).toEqual(["Sum of Total"]);
  });

  it("runs once Count of rows is picked", async () => {
    const { onQueryChange, getLastQuery } = setup();

    await userEvent.type(screen.getByLabelText("Add a value by name"), "count");
    const options = await screen.findAllByRole("option");
    const countOption = options.find(
      (option) => option.textContent === "Count of rows",
    );
    if (countOption == null) {
      throw new Error("No Count of rows option");
    }
    await userEvent.click(countOption);

    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(getLastQuery()).toEqual({ values: ["Count"], dimensions: [] });
  });

  it("doesn't rerun when a value that's already there is picked again", async () => {
    const { onQueryChange } = setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count" }],
          },
        ],
      }),
    });

    await userEvent.type(screen.getByLabelText("Add a value by name"), "count");
    const options = await screen.findAllByRole("option");
    const countOption = options.find(
      (option) => option.textContent === "Count of rows",
    );
    if (countOption == null) {
      throw new Error("No Count of rows option");
    }
    await userEvent.click(countOption);

    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("doesn't count the rows again when a named count is already there", async () => {
    const { onQueryChange } = setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [
              {
                name: "Orders",
                value: { type: "operator", operator: "count" },
              },
            ],
          },
        ],
      }),
    });

    await userEvent.type(screen.getByLabelText("Add a value by name"), "count");
    const options = await screen.findAllByRole("option");
    const countOption = options.find(
      (option) => option.textContent === "Count of rows",
    );
    expect(countOption).toBeDefined();
    if (countOption) {
      await userEvent.click(countOption);
    }

    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("aggregates a column picked in the Summarize by typeahead with its default operator", async () => {
    const { getLastQuery } = setup();

    await userEvent.type(screen.getByLabelText("Add a value by name"), "quant");
    const options = await screen.findAllByRole("option");
    const quantityOption = options.find(
      (option) => option.textContent === "Quantity",
    );
    if (quantityOption == null) {
      throw new Error("No Quantity option");
    }
    await userEvent.click(quantityOption);

    expect(getLastQuery()).toEqual({
      values: ["Sum of Quantity"],
      dimensions: [],
    });
  });

  it("replaces the groupings on a field click and adds on alt-click", async () => {
    const { getLastQuery } = setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count" }],
            breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
          },
        ],
      }),
    });

    await userEvent.click(getFieldButton("Product", "Category"));
    expect(getLastQuery().dimensions).toEqual(["Product → Category"]);

    fireEvent.click(getFieldButton("Orders", "Created At"), { altKey: true });
    expect(getLastQuery().dimensions).toEqual([
      "Product → Category",
      "Created At: Month",
    ]);

    await userEvent.click(getFieldButton("Orders", "Created At"));
    expect(getLastQuery().dimensions).toEqual(["Created At: Month"]);
  });

  it("adds a column that's already grouped again, with its next unit, on alt-click", () => {
    const { getLastQuery } = setup({ query: SUMMARIZED_QUERY });

    fireEvent.click(getFieldButton("Orders", "Created At"), { altKey: true });

    expect(getLastQuery().dimensions).toEqual([
      "Created At: Month",
      "Created At: Quarter",
    ]);
  });

  it("doesn't rerun when the clicked field is all its well holds", async () => {
    const { onQueryChange } = setup({ query: createQueryWithMetric() });

    await userEvent.click(getFieldButton("Metrics", "Revenue"));
    await userEvent.click(getFieldButton("Metrics", "Revenue"));
    await userEvent.click(getFieldButton("Product", "Category"));
    await userEvent.click(getFieldButton("Product", "Category"));

    expect(onQueryChange).toHaveBeenCalledTimes(2);
  });

  it("replaces the values on a metric click", async () => {
    const { getLastQuery } = setup({ query: createQueryWithMetric() });

    await userEvent.click(getFieldButton("Metrics", "Revenue"));

    expect(getLastQuery()).toEqual({ values: ["Revenue"], dimensions: [] });
    expect(getChipLabels("values")).toEqual(["Revenue"]);
  });

  describe("drag and drop", () => {
    it("adds a dragged field to the well it's dropped on", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
      const { onQueryChange, getLastQuery } = setup({ query });

      drop(getFieldDrag(query, "Orders", "Quantity"), "values");
      expect(getLastQuery()).toEqual({
        values: ["Sum of Quantity"],
        dimensions: [],
      });

      drop(getFieldDrag(query, "Product", "Category"), "columns");
      expect(getLastQuery()).toEqual({
        values: ["Sum of Quantity"],
        dimensions: ["Product → Category"],
      });
      expect(onQueryChange).toHaveBeenCalledTimes(2);
      expect(getChipLabels("columns")).toEqual(["Product → Category"]);
    });

    it("adds a dragged column that's already grouped again, with its next unit", () => {
      const { getLastQuery } = setup({ query: SUMMARIZED_QUERY });

      drop(getFieldDrag(SUMMARIZED_QUERY, "Orders", "Created At"), "columns");

      expect(getLastQuery().dimensions).toEqual([
        "Created At: Month",
        "Created At: Quarter",
      ]);
    });

    it("shows a preview and which wells take the dragged item until the drag ends", () => {
      const query = createQueryWithMetric();
      setup({ query });
      const valuesWell = screen.getByTestId("summary-well-values");
      const columnsWell = screen.getByTestId("summary-well-columns");

      startDrag(getFieldDrag(query, "Metrics", "Revenue"));
      expect(valuesWell).toHaveAttribute("data-drop", "accepts");
      expect(columnsWell).toHaveAttribute("data-drop", "rejects");
      expect(screen.getByTestId("summary-drag-preview")).toHaveTextContent(
        "Revenue",
      );

      endDrag(null);
      expect(valuesWell).not.toHaveAttribute("data-drop");
      expect(columnsWell).not.toHaveAttribute("data-drop");
      expect(
        screen.queryByTestId("summary-drag-preview"),
      ).not.toBeInTheDocument();
    });

    it("moves a grouping chip to Summarize by", () => {
      const { getLastQuery } = setup({ query: SUMMARIZED_QUERY });
      const [item] = getDimensionItems(SUMMARIZED_QUERY, STAGE_INDEX);

      drop({ kind: "dimension", item, wellId: "columns" }, "values");

      expect(getLastQuery()).toEqual({
        values: ["Count", "Sum of Total", "Distinct values of Created At"],
        dimensions: [],
      });
    });

    it("moves a column value chip to Group by", () => {
      const { getLastQuery } = setup({ query: SUMMARIZED_QUERY });
      const [, item] = getValueItems(SUMMARIZED_QUERY, STAGE_INDEX);

      drop({ kind: "value", item }, "columns");

      expect(getLastQuery()).toEqual({
        values: ["Count"],
        dimensions: ["Created At: Month", "Total: Auto binned"],
      });
    });

    it("leaves the query alone when the drop is rejected or misses", () => {
      const { onQueryChange } = setup({ query: SUMMARIZED_QUERY });
      const [countItem] = getValueItems(SUMMARIZED_QUERY, STAGE_INDEX);

      drop({ kind: "value", item: countItem }, "columns");
      drop({ kind: "value", item: countItem }, "values");
      drop(getFieldDrag(SUMMARIZED_QUERY, "Orders", "Quantity"), null);

      expect(onQueryChange).not.toHaveBeenCalled();
    });

    it("leaves an empty summary alone when a metric is dropped on Group by", () => {
      const query = createQueryWithMetric();
      const { onQueryChange } = setup({ query });

      drop(getFieldDrag(query, "Metrics", "Revenue"), "columns");

      expect(onQueryChange).not.toHaveBeenCalled();
      expect(getChipLabels("values")).toEqual([]);
    });

    it("doesn't count the rows when a grouping chip is dropped back on Group by", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
          },
        ],
      });
      const { onQueryChange } = setup({ query });
      const [item] = getDimensionItems(query, STAGE_INDEX);

      drop({ kind: "dimension", item, wellId: "columns" }, "columns");

      expect(onQueryChange).not.toHaveBeenCalled();
    });
  });

  it("hides and shows the field list from the footer button", async () => {
    setup();
    const drawer = screen.getByTestId("summary-field-list-drawer");

    await userEvent.click(screen.getByLabelText("Hide fields"));
    expect(drawer).not.toHaveAttribute("data-open");
    expect(screen.getByLabelText("Show fields")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByLabelText("Show fields")).toHaveAttribute(
      "aria-controls",
      drawer.id,
    );

    await userEvent.click(screen.getByLabelText("Show fields"));
    expect(drawer).toHaveAttribute("data-open");
    expect(screen.getByLabelText("Hide fields")).toBeInTheDocument();
  });
});

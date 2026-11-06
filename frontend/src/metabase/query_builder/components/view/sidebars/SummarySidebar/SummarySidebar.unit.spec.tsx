import type * as DndKit from "@dnd-kit/core";
import type { Active, ClientRect, DndContextProps, Over } from "@dnd-kit/core";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import {
  createMockCard,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { SummarySidebar } from "./SummarySidebar";
import type { SummaryDragItem, SummaryWellId } from "./types";
import { getDimensionItems, getFieldSections, getValueItems } from "./utils";

const STAGE_INDEX = -1;

const mockDnd: Pick<DndContextProps, "onDragEnd"> & {
  setActive?: (active: Active | null) => void;
} = {};

jest.mock("@dnd-kit/core", () => {
  const actual = jest.requireActual<typeof DndKit>("@dnd-kit/core");
  const { createContext, useContext, useState } =
    jest.requireActual<typeof React>("react");
  const ActiveContext = createContext<Active | null>(null);
  return {
    ...actual,
    DndContext: ({ children, onDragEnd }: DndContextProps) => {
      const [active, setActive] = useState<Active | null>(null);
      mockDnd.onDragEnd = onDragEnd;
      mockDnd.setActive = setActive;
      return (
        <ActiveContext.Provider value={active}>
          {children}
        </ActiveContext.Provider>
      );
    },
    useDndContext: () => ({
      ...actual.useDndContext(),
      active: useContext(ActiveContext),
    }),
    DragOverlay: ({ children }: DndKit.DragOverlayProps) => children,
  };
});

const EMPTY_RECT: ClientRect = {
  width: 0,
  height: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

function createActive(item: SummaryDragItem): Active {
  return {
    id: "dragged",
    data: { current: item },
    rect: { current: { initial: null, translated: null } },
  };
}

function createOver(wellId: SummaryWellId): Over {
  return {
    id: `well:${wellId}`,
    data: { current: { wellId } },
    rect: EMPTY_RECT,
    disabled: false,
  };
}

let dragged: Active | null = null;

function startDrag(item: SummaryDragItem) {
  dragged = createActive(item);
  const active = dragged;
  act(() => mockDnd.setActive?.(active));
}

function endDrag(wellId: SummaryWellId | null) {
  if (dragged == null) {
    throw new Error("No drag to end");
  }
  const active = dragged;
  dragged = null;
  act(() => {
    mockDnd.onDragEnd?.({
      active,
      activatorEvent: new Event("pointerup"),
      collisions: null,
      delta: { x: 0, y: 0 },
      over: wellId && createOver(wellId),
    });
    mockDnd.setActive?.(null);
  });
}

function drop(item: SummaryDragItem, wellId: SummaryWellId | null) {
  startDrag(item);
  endDrag(wellId);
}

function getFieldDrag(
  query: Lib.Query,
  sectionName: string,
  name: string,
): SummaryDragItem {
  const section = getFieldSections(query, STAGE_INDEX).find(
    (section) => section.name === sectionName,
  );
  const item = section?.items.find((item) => item.name === name);
  if (item == null) {
    throw new Error(`No field ${name} in ${sectionName}`);
  }
  return { kind: "field", field: item.field, label: item.name };
}

const SUMMARIZED_QUERY = Lib.createTestQuery(SAMPLE_PROVIDER, {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      aggregations: [
        { type: "operator", operator: "count" },
        {
          type: "operator",
          operator: "sum",
          args: [{ type: "column", name: "TOTAL" }],
        },
      ],
      breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
    },
  ],
});

type SetupOpts = {
  query?: Lib.Query;
};

function setup({
  query: initialQuery = Lib.createTestQuery(
    SAMPLE_PROVIDER,
    DEFAULT_TEST_QUERY,
  ),
}: SetupOpts = {}) {
  const onQueryChange = jest.fn<void, [Lib.Query]>();

  function Wrapper() {
    const [query, setQuery] = useState(initialQuery);
    return (
      <SummarySidebar
        query={query}
        stageIndex={STAGE_INDEX}
        onQueryChange={(nextQuery) => {
          setQuery(nextQuery);
          onQueryChange(nextQuery);
        }}
      />
    );
  }

  renderWithProviders(<Wrapper />);

  function getLastQuery() {
    const [lastCall] = onQueryChange.mock.calls.slice(-1);
    const [nextQuery] = lastCall;
    return {
      values: getValueItems(nextQuery, STAGE_INDEX).map(({ label }) => label),
      dimensions: getDimensionItems(nextQuery, STAGE_INDEX).map(
        ({ label }) => label,
      ),
    };
  }

  return { onQueryChange, getLastQuery };
}

function createQueryWithMetric() {
  const metric = createMockCard({
    id: 1,
    name: "Revenue",
    type: "metric",
    table_id: ORDERS_ID,
    dataset_query: createMockStructuredDatasetQuery({
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.SUBTOTAL, null]]],
      },
    }),
  });
  const provider = createMetadataProvider({
    metadata: createMockMetadata({
      databases: [createSampleDatabase()],
      questions: [metric],
    }),
  });
  return Lib.createTestQuery(provider, {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  });
}

function getChipLabels(wellId: SummaryWellId) {
  return within(screen.getByTestId(`summary-well-${wellId}`))
    .queryAllByTestId("summary-well-item")
    .map((chip) => chip.textContent);
}

function getFieldButton(sectionName: string, name: string) {
  return within(screen.getByRole("region", { name: sectionName })).getByRole(
    "button",
    { name },
  );
}

describe("SummarySidebar", () => {
  it("starts a bare query from Count of rows without running it", () => {
    const { onQueryChange } = setup();

    expect(getChipLabels("values")).toEqual(["Count"]);
    expect(getChipLabels("columns")).toEqual([]);
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("runs once a grouping joins the starting count", async () => {
    const { onQueryChange, getLastQuery } = setup();

    await userEvent.click(getFieldButton("Product", "Category"));

    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(getLastQuery()).toEqual({
      values: ["Count"],
      dimensions: ["Product → Category"],
    });
    expect(getChipLabels("columns")).toEqual(["Product → Category"]);
  });

  it("runs the starting count once Count of rows is picked", async () => {
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
      values: ["Count", "Sum of Quantity"],
      dimensions: [],
    });
  });

  it("drops the starting count without running when it's removed first", async () => {
    const { onQueryChange } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Remove Count" }));

    expect(getChipLabels("values")).toEqual([]);
    expect(onQueryChange).not.toHaveBeenCalled();
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
  });

  it("replaces the values on a metric click", async () => {
    const { getLastQuery } = setup({ query: createQueryWithMetric() });

    await userEvent.click(getFieldButton("Metrics", "Revenue"));

    expect(getLastQuery()).toEqual({ values: ["Revenue"], dimensions: [] });
    expect(getChipLabels("values")).toEqual(["Revenue"]);
  });

  it("clears every well at once", async () => {
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

    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(getLastQuery()).toEqual({ values: [], dimensions: [] });
    expect(getChipLabels("values")).toEqual([]);
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
  });

  describe("drag and drop", () => {
    it("adds a dragged field to the well it's dropped on", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
      const { onQueryChange, getLastQuery } = setup({ query });

      drop(getFieldDrag(query, "Orders", "Quantity"), "values");
      expect(getLastQuery()).toEqual({
        values: ["Count", "Sum of Quantity"],
        dimensions: [],
      });

      drop(getFieldDrag(query, "Product", "Category"), "columns");
      expect(getLastQuery()).toEqual({
        values: ["Count", "Sum of Quantity"],
        dimensions: ["Product → Category"],
      });
      expect(onQueryChange).toHaveBeenCalledTimes(2);
      expect(getChipLabels("columns")).toEqual(["Product → Category"]);
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

      drop({ kind: "dimension", item }, "values");

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

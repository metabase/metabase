import type * as DndKit from "@dnd-kit/core";
import type { Active, ClientRect, DndContextProps, Over } from "@dnd-kit/core";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import { setupUserMetabotPermissionsEndpoint } from "__support__/server-mocks";
import { act, renderWithProviders, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type {
  ColumnNameColumnSplitSetting,
  TestAggregationSpec,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { SummarySidebar } from "../SummarySidebar";
import type {
  SummaryDragItem,
  SummaryPivotChange,
  SummaryWellId,
} from "../types";
import { getDimensionItems, getFieldSections, getValueItems } from "../utils";

export const STAGE_INDEX = -1;

const mockDnd: Pick<
  DndContextProps,
  "onDragStart" | "onDragEnd" | "onDragCancel"
> = {};

jest.mock("@dnd-kit/core", () => {
  const actual = jest.requireActual<typeof DndKit>("@dnd-kit/core");
  return {
    ...actual,
    DndContext: ({
      children,
      onDragStart,
      onDragEnd,
      onDragCancel,
    }: DndContextProps) => {
      Object.assign(mockDnd, { onDragStart, onDragEnd, onDragCancel });
      return children;
    },
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

export function startDrag(item: SummaryDragItem) {
  dragged = createActive(item);
  const active = dragged;
  act(() => mockDnd.onDragStart?.({ active }));
}

export function endDrag(wellId: SummaryWellId | null) {
  if (dragged == null) {
    throw new Error("No drag to end");
  }
  const active = dragged;
  dragged = null;
  act(() =>
    mockDnd.onDragEnd?.({
      active,
      activatorEvent: new Event("pointerup"),
      collisions: null,
      delta: { x: 0, y: 0 },
      over: wellId && createOver(wellId),
    }),
  );
}

export function drop(item: SummaryDragItem, wellId: SummaryWellId | null) {
  startDrag(item);
  endDrag(wellId);
}

export function getFieldDrag(
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

export const COUNT: TestAggregationSpec = {
  type: "operator",
  operator: "count",
};

export const SUM_OF_TOTAL: TestAggregationSpec = {
  type: "operator",
  operator: "sum",
  args: [{ type: "column", name: "TOTAL" }],
};

export const SUMMARIZED_QUERY = Lib.createTestQuery(SAMPLE_PROVIDER, {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      aggregations: [COUNT, SUM_OF_TOTAL],
      breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
    },
  ],
});

type SetupOpts = {
  query?: Lib.Query;
  canPivot?: boolean;
  pivotColumnSplit?: ColumnNameColumnSplitSetting;
};

export function setup({
  query: initialQuery = Lib.createTestQuery(
    SAMPLE_PROVIDER,
    DEFAULT_TEST_QUERY,
  ),
  canPivot,
  pivotColumnSplit: initialPivotColumnSplit,
}: SetupOpts = {}) {
  setupUserMetabotPermissionsEndpoint();
  const onQueryChange = jest.fn<void, [Lib.Query, SummaryPivotChange?]>();

  function Wrapper() {
    const [query, setQuery] = useState(initialQuery);
    const [pivotColumnSplit, setPivotColumnSplit] = useState(
      initialPivotColumnSplit,
    );
    return (
      <>
        <SummarySidebar
          query={query}
          stageIndex={STAGE_INDEX}
          canPivot={canPivot}
          pivotColumnSplit={pivotColumnSplit}
          onQueryChange={(nextQuery, pivotChange) => {
            setQuery(nextQuery);
            if (pivotChange?.type === "show") {
              setPivotColumnSplit(pivotChange.columnSplit);
            }
            if (pivotChange?.type === "hide") {
              setPivotColumnSplit(undefined);
            }
            onQueryChange(nextQuery, pivotChange);
          }}
        />
        <button onClick={() => setPivotColumnSplit(undefined)}>
          Go back to a non-pivot question
        </button>
      </>
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

  function getLastPivotChange() {
    const [lastCall] = onQueryChange.mock.calls.slice(-1);
    const [, pivotChange] = lastCall;
    return pivotChange;
  }

  return { onQueryChange, getLastQuery, getLastPivotChange };
}

export function createQueryWithMetric() {
  const metric = createMockCard({
    id: 1,
    name: "Revenue",
    type: "metric",
    table_id: ORDERS_ID,
    dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [
            {
              type: "operator",
              operator: "sum",
              args: [{ type: "column", fieldId: ORDERS.SUBTOTAL }],
            },
          ],
        },
      ],
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

export function getChipLabels(wellId: SummaryWellId) {
  return within(screen.getByTestId(`summary-well-${wellId}`))
    .queryAllByTestId("summary-well-item")
    .map((chip) => chip.textContent);
}

export function getFieldButton(sectionName: string, name: string) {
  return within(screen.getByRole("region", { name: sectionName })).getByRole(
    "button",
    { name },
  );
}

import type { ReactNode } from "react";

import { setupRunInspectorQueryEndpoint } from "__support__/server-mocks/transform";
import { renderWithProviders, screen } from "__support__/ui";
import type {
  InspectorCard,
  InspectorField,
  InspectorSource,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockInspectorCard,
  createMockTransform,
  createMockTransformInspectSource,
} from "metabase-types/api/mocks";

import { useCardLoadingTracker } from "../../../../../hooks";
import { LensContentProvider } from "../../../../LensContent/LensContentContext";

import { ComparisonLayout } from "./ComparisonLayout";
import { type CardGroup, sortGroupsByScore } from "./utils";

jest.mock("metabase/transforms/lib/transforms-inspector", () => ({
  interestingFields: (
    fields: InspectorField[],
    _visitedFields: unknown,
    // we use field ID as the score for testing purposes
  ): Array<InspectorField & { interestingness: { score: number } }> =>
    fields.map((f) => ({ ...f, interestingness: { score: f.id ?? 0 } })),
  computeCardStats: () => null,
}));

const makeSource = (
  tableName: string,
  fields: Array<{ name: string; id: number }>,
) =>
  createMockTransformInspectSource({
    table_name: tableName,
    column_count: fields.length,
    fields: fields.map((f) => ({ name: f.name, id: f.id })),
  });

const makeInspectorCard = (opts: {
  id: string;
  title: string;
  groupId: string;
  groupRole: "input" | "output";
  tableId?: number;
  fieldId?: number;
}) =>
  createMockInspectorCard({
    id: opts.id,
    title: opts.title,
    display: "scalar",
    metadata: {
      card_type: "table_count",
      dedup_key: [],
      group_id: opts.groupId,
      group_role: opts.groupRole,
      table_id: opts.tableId ?? 1,
      ...(opts.fieldId !== undefined && { field_id: opts.fieldId }),
    },
  });

const makeGroup = (
  groupId: string,
  inputFieldIds: number[],
  outputTitles: string[] = [],
): CardGroup => ({
  groupId,
  inputCards: inputFieldIds.map((fieldId, index) =>
    createMockInspectorCard({
      id: `${groupId}-in-${index}`,
      title: `Card ${index}`,
      metadata: { card_type: "table_count", dedup_key: [], field_id: fieldId },
    }),
  ),
  outputCards: outputTitles.map((title, index) =>
    createMockInspectorCard({ id: `${groupId}-out-${index}`, title }),
  ),
});

describe("sortGroupsByScore", () => {
  it("sorts groups by highest field score descending", () => {
    const sources = [
      makeSource("orders", [
        { name: "Revenue", id: 10 },
        { name: "Quantity", id: 5 },
      ]),
    ];
    const groups = [makeGroup("low", [5]), makeGroup("high", [10])];

    const result = sortGroupsByScore(groups, sources);

    expect(result.map((g) => g.groupId)).toEqual(["high", "low"]);
    expect(result[0].topScore).toBe(10);
    expect(result[1].topScore).toBe(5);
  });

  it("uses the maximum score among input cards in a group", () => {
    const sources = [
      makeSource("orders", [
        { name: "Revenue", id: 10 },
        { name: "Quantity", id: 2 },
        { name: "Discount", id: 8 },
      ]),
    ];
    const groups = [makeGroup("mixed", [2, 10, 8])];

    const result = sortGroupsByScore(groups, sources);

    expect(result[0].topScore).toBe(10);
  });

  it("assigns score 0 for cards whose field_id doesn't match any field", () => {
    const sources = [makeSource("orders", [{ name: "Revenue", id: 10 }])];
    const groups = [makeGroup("unknown", [999])];

    const result = sortGroupsByScore(groups, sources);

    expect(result[0].topScore).toBe(0);
  });

  it("preserves group data (inputCards, outputCards) in results", () => {
    const sources = [makeSource("orders", [{ name: "Revenue", id: 5 }])];
    const groups = [makeGroup("g1", [5], ["Output"])];

    const result = sortGroupsByScore(groups, sources);

    expect(result[0].inputCards).toHaveLength(1);
    expect(result[0].outputCards).toHaveLength(1);
    expect(result[0].inputCards[0].title).toBe("Card 0");
    expect(result[0].outputCards[0].title).toBe("Output");
  });
});

const defaultCardsForTwoGroups = [
  makeInspectorCard({
    id: "g1-in-0",
    title: "Group 1 Input",
    groupId: "g1",
    groupRole: "input",
    fieldId: 10,
  }),
  makeInspectorCard({
    id: "g1-out-0",
    title: "Group 1 Output",
    groupId: "g1",
    groupRole: "output",
  }),
  makeInspectorCard({
    id: "g2-in-0",
    title: "Group 2 Input 1",
    groupId: "g2",
    groupRole: "input",
    fieldId: 8,
  }),
  makeInspectorCard({
    id: "g2-in-1",
    title: "Group 2 Input 2",
    groupId: "g2",
    groupRole: "input",
    fieldId: 6,
  }),
  makeInspectorCard({
    id: "g2-out-0",
    title: "Group 2 Output",
    groupId: "g2",
    groupRole: "output",
  }),
];

const defaultSources = [
  createMockTransformInspectSource({
    table_id: 1,
    table_name: "orders",
    column_count: 3,
    fields: [
      { name: "Revenue", id: 10 },
      { name: "Discount", id: 8 },
      { name: "Quantity", id: 6 },
    ],
  }),
];

interface SetupOpts {
  cards?: InspectorCard[];
  sources?: InspectorSource[];
}

function setup({
  cards = defaultCardsForTwoGroups,
  sources = defaultSources,
}: SetupOpts = {}) {
  const lensId = "lens-1";
  setupRunInspectorQueryEndpoint(
    1,
    lensId,
    createMockDataset({
      data: {
        rows: [[42]],
        cols: [createMockColumn({ name: "count" })],
      },
    }),
  );

  const ContextWrapper = ({ children }: { children: ReactNode }) => {
    const { markCardLoaded, markCardStartedLoading, subscribeToCardLoaded } =
      useCardLoadingTracker(jest.fn());

    return (
      <LensContentProvider
        transform={createMockTransform({ id: 1 })}
        lens={{ id: lensId, display_name: "Test", sections: [], cards: [] }}
        lensHandle={{ id: lensId }}
        alertsByCardId={{}}
        drillLensesByCardId={{}}
        collectedCardStats={{}}
        navigateToLens={jest.fn()}
        pushNewStats={jest.fn()}
        markCardStartedLoading={markCardStartedLoading}
        markCardLoaded={markCardLoaded}
        subscribeToCardLoaded={subscribeToCardLoaded}
      >
        {children}
      </LensContentProvider>
    );
  };

  renderWithProviders(
    <ContextWrapper>
      <ComparisonLayout cards={cards} sources={sources} />
    </ContextWrapper>,
  );
}

describe("ComparisonLayout", () => {
  it("loads cards if part of a group is visible (metabase#GDGT-2002)", async () => {
    setup();

    await screen.findByText("Group 1 Input");
    await screen.findByText("Group 1 Output");

    expect(screen.getByText("Group 2 Input 1")).toBeInTheDocument();
    expect(screen.getByText("Group 2 Input 2")).toBeInTheDocument();
    expect(screen.getByText("Group 2 Output")).toBeInTheDocument();
  });
});

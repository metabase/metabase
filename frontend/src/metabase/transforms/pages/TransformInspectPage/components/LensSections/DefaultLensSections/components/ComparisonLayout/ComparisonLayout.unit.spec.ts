import type { InspectorField } from "metabase-types/api";
import {
  createMockInspectorCard,
  createMockTransformInspectSource,
} from "metabase-types/api/mocks";

import { type CardGroup, sortGroupsByScore } from "./utils";

jest.mock("metabase/transforms/lib/transforms-inspector", () => ({
  interestingFields: (
    fields: InspectorField[],
    _visitedFields: unknown,
    // we use field ID as the score for testing purposes
  ): Array<InspectorField & { interestingness: { score: number } }> =>
    fields.map((f) => ({ ...f, interestingness: { score: f.id ?? 0 } })),
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

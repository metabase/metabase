import type { TransformInspectField } from "metabase-types/api";
import {
  createMockInspectorCard,
  createMockTransformInspectSource,
} from "metabase-types/api/mocks";

import { type CardGroup, sortGroupsByScore } from "./utils";

jest.mock("metabase-lib/transforms-inspector", () => ({
  interestingFields: (
    fields: TransformInspectField[],
    _visitedFields: unknown,
    // we use field ID as the score for testing purposes
  ): Array<TransformInspectField & { interestingness: { score: number } }> =>
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
  inputTitles: string[],
  outputTitles: string[] = [],
): CardGroup => ({
  groupId,
  inputCards: inputTitles.map((title, index) =>
    createMockInspectorCard({ id: `${groupId}-in-${index}`, title }),
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
    const groups = [
      makeGroup("low", ["Quantity"]),
      makeGroup("high", ["Revenue"]),
    ];

    const result = sortGroupsByScore({ sources, groups });

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
    const groups = [makeGroup("mixed", ["Quantity", "Revenue", "Discount"])];

    const result = sortGroupsByScore({ sources, groups });

    expect(result[0].topScore).toBe(10);
  });

  it("assigns score 0 for cards whose titles don't match any field", () => {
    const sources = [makeSource("orders", [{ name: "Revenue", id: 10 }])];
    const groups = [makeGroup("unknown", ["NonExistentField"])];

    const result = sortGroupsByScore({ sources, groups });

    expect(result[0].topScore).toBe(0);
  });

  it("parses field name from title with table suffix like 'Revenue (Orders)'", () => {
    const sources = [
      makeSource("orders", [{ name: "Revenue", id: 10 }]),
      makeSource("products", [{ name: "Price", id: 3 }]),
    ];
    const groups = [
      makeGroup("products", ["Price (Products)"]),
      makeGroup("orders", ["Revenue (Orders)"]),
    ];

    const result = sortGroupsByScore({ sources, groups });

    expect(result.map((g) => g.groupId)).toEqual(["orders", "products"]);
    expect(result[0].topScore).toBe(10);
    expect(result[1].topScore).toBe(3);
  });

  it("preserves group data (inputCards, outputCards) in results", () => {
    const sources = [makeSource("orders", [{ name: "Revenue", id: 5 }])];
    const groups = [makeGroup("g1", ["Revenue"], ["Output"])];

    const result = sortGroupsByScore({ sources, groups });

    expect(result[0].inputCards).toHaveLength(1);
    expect(result[0].outputCards).toHaveLength(1);
    expect(result[0].inputCards[0].title).toBe("Revenue");
    expect(result[0].outputCards[0].title).toBe("Output");
  });
});

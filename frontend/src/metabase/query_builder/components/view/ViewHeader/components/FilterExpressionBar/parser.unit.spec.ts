import { createQuery } from "metabase/querying/filters/components/FilterPicker/test-utils";

import {
  type ExprToken,
  type Token,
  buildExpression,
  getTopLevelOperands,
  parseDraft,
  splitText,
  stageOf,
  validate,
} from "./parser";
import { getFilterSchema } from "./schema";

function setup() {
  const query = createQuery();
  return getFilterSchema(query, -1);
}

function getLogicOps(text: string) {
  const schema = setup();
  return splitText(text, schema)
    .filter((part) => part.kind === "logic")
    .map((part) => part.op);
}

describe("splitText", () => {
  it("splits connectors and parentheses", () => {
    expect(
      getLogicOps("(category is gizmo or total > 100) and tax < 5"),
    ).toEqual(["(", "OR", ")", "AND"]);
  });

  it("does not split inside quotes", () => {
    expect(getLogicOps('category is "rock and roll" or tax < 5')).toEqual([
      "OR",
    ]);
  });

  it("waits for a character after a word connector at the end", () => {
    expect(getLogicOps("country is France, And")).toEqual([]);
    expect(getLogicOps("country is France, And ")).toEqual(["AND"]);
  });

  it("keeps the and of a range in the filter", () => {
    expect(
      getLogicOps("total between 10 and 20 and category is gizmo"),
    ).toEqual(["AND"]);
  });
});

describe("parseDraft", () => {
  it("finds the field, the longest operator, and the values", () => {
    const schema = setup();
    const parsed = parseDraft("Category is not Gizmo, Widget", schema);
    expect(parsed.field?.label).toBe("Category");
    expect(parsed.op?.key).toBe("!=");
    expect(parsed.values).toEqual(["Gizmo", "Widget"]);
  });

  it("matches symbol operators without spaces", () => {
    const schema = setup();
    const parsed = parseDraft("total >100", schema);
    expect(parsed.op?.key).toBe(">");
    expect(parsed.values).toEqual(["100"]);
  });

  it("parses the two values of a range", () => {
    const schema = setup();
    const parsed = parseDraft("Total between 10 and 20", schema);
    expect(parsed.op?.key).toBe("between");
    expect(parsed.values).toEqual(["10", "20"]);
  });

  it("does not match a field inside a longer word", () => {
    const schema = setup();
    expect(parseDraft("totally", schema).field).toBeUndefined();
  });

  it("treats a slash as an AI prompt", () => {
    const schema = setup();
    expect(parseDraft("/big orders", schema).isAi).toBe(true);
  });
});

describe("stageOf", () => {
  it("follows the caret through the parts", () => {
    const schema = setup();
    const text = "Total > 100";
    const parsed = parseDraft(text, schema);
    expect(stageOf(parsed, 2)).toBe("field");
    expect(stageOf(parsed, 7)).toBe("operator");
    expect(stageOf(parsed, text.length)).toBe("value");
    expect(stageOf(parseDraft("", schema), 0)).toBe("empty");
  });
});

describe("validate", () => {
  const filter: Token = {
    kind: "filter",
    attrs: { columnKey: "0:0", operatorKey: "=", values: ["1"] },
    pos: 0,
  };

  it("accepts a valid expression", () => {
    expect(
      validate([
        { kind: "logic", op: "(" },
        filter,
        { kind: "logic", op: "OR" },
        filter,
        { kind: "logic", op: ")" },
        { kind: "logic", op: "AND" },
        filter,
      ]),
    ).toEqual([]);
  });

  it("reports missing connectors, dangling connectors, and parentheses", () => {
    expect(validate([filter, filter])).toHaveLength(1);
    expect(validate([filter, { kind: "logic", op: "AND" }])).toHaveLength(1);
    expect(validate([{ kind: "logic", op: "(" }, filter])).toHaveLength(1);
    expect(validate([filter, { kind: "text", text: "foo" }])).toHaveLength(2);
  });
});

describe("buildExpression", () => {
  const leaf = (name: string): ExprToken<string> => ({
    kind: "leaf",
    leaf: name,
  });
  const and: ExprToken<string> = { kind: "logic", op: "AND" };
  const or: ExprToken<string> = { kind: "logic", op: "OR" };

  it("binds AND tighter than OR", () => {
    expect(buildExpression([leaf("a"), or, leaf("b"), and, leaf("c")])).toEqual(
      {
        kind: "or",
        args: [
          { kind: "leaf", leaf: "a" },
          {
            kind: "and",
            args: [
              { kind: "leaf", leaf: "b" },
              { kind: "leaf", leaf: "c" },
            ],
          },
        ],
      },
    );
  });

  it("respects parentheses and flattens runs of one connector", () => {
    const expr = buildExpression([
      { kind: "logic", op: "(" },
      leaf("a"),
      or,
      leaf("b"),
      or,
      leaf("c"),
      { kind: "logic", op: ")" },
      and,
      leaf("d"),
    ]);
    const operands = getTopLevelOperands(expr);
    expect(operands).toHaveLength(2);
    expect(operands[0]).toMatchObject({ kind: "or" });
    expect(operands[0].kind === "or" && operands[0].args).toHaveLength(3);
    expect(operands[1]).toEqual({ kind: "leaf", leaf: "d" });
  });
});

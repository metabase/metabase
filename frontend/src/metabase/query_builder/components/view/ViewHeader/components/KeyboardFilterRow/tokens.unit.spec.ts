import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  columnFinder,
} from "metabase-lib/test-helpers";

import {
  CLOSE_PAREN,
  OPEN_PAREN,
  type Token,
  closeUnclosedGroups,
  filterToken,
  getSummaryStageIndex,
  insertParen,
  insertToken,
  matchLogic,
  opToken,
  parseTokens,
  readTokens,
  removeParenPair,
  removePillAt,
  settleConnectors,
  toFilterClause,
  writeTokens,
} from "./tokens";

const STAGE_INDEX = 0;

function createQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
}

function findOrdersColumn(query: Lib.Query, columnName: string) {
  const columns = Lib.filterableColumns(query, STAGE_INDEX);
  return columnFinder(query, columns)("ORDERS", columnName);
}

function numberFilter(
  query: Lib.Query,
  columnName: string,
  operator: Lib.NumberFilterOperator,
  value: number,
) {
  return toFilterClause(
    query,
    STAGE_INDEX,
    Lib.numberFilterClause({
      operator,
      column: findOrdersColumn(query, columnName),
      values: [value],
    }),
  );
}

function describeTokens(query: Lib.Query, tokens: Token[]) {
  return tokens
    .map((token) => {
      switch (token.type) {
        case "filter":
          return Lib.displayInfo(query, STAGE_INDEX, token.clause).displayName;
        case "op":
          return token.op;
        case "paren":
          return token.side === "open" ? "(" : ")";
      }
    })
    .join(" ");
}

describe("parseTokens", () => {
  const a = filterToken(numberFilter(createQuery(), "TOTAL", ">", 100));
  const b = filterToken(numberFilter(createQuery(), "TAX", ">", 2));
  const c = filterToken(numberFilter(createQuery(), "QUANTITY", ">", 3));

  it("accepts an empty expression", () => {
    expect(parseTokens([])).toEqual({ ok: true, tree: undefined });
  });

  it("binds and tighter than or", () => {
    expect(parseTokens([a, opToken("or"), b, opToken("and"), c])).toMatchObject(
      {
        ok: true,
        tree: {
          type: "node",
          op: "or",
          args: [
            { type: "leaf" },
            {
              type: "node",
              op: "and",
              args: [{ type: "leaf" }, { type: "leaf" }],
            },
          ],
        },
      },
    );
  });

  it("lets parentheses override the precedence", () => {
    expect(
      parseTokens([
        OPEN_PAREN,
        a,
        opToken("or"),
        b,
        CLOSE_PAREN,
        opToken("and"),
        c,
      ]),
    ).toMatchObject({
      ok: true,
      tree: {
        type: "node",
        op: "and",
        args: [{ type: "node", op: "or" }, { type: "leaf" }],
      },
    });
  });

  it.each<{
    name: string;
    tokens: Token[];
    position: number;
    positions?: number[];
  }>([
    { name: "a dangling operator", tokens: [a, opToken("or")], position: 2 },
    { name: "a leading operator", tokens: [opToken("or"), a], position: 0 },
    {
      name: "empty parentheses",
      tokens: [OPEN_PAREN, CLOSE_PAREN],
      position: 1,
    },
    {
      name: "a missing closing parenthesis",
      tokens: [OPEN_PAREN, a, opToken("or"), b],
      position: 4,
    },
    {
      name: "an unexpected closing parenthesis",
      tokens: [a, CLOSE_PAREN],
      position: 1,
    },
    {
      name: "two filters without an operator",
      tokens: [a, b],
      position: 1,
      positions: [0, 1],
    },
    {
      name: "two filters without an operator inside a group",
      tokens: [OPEN_PAREN, a, b, CLOSE_PAREN],
      position: 2,
      positions: [1, 2],
    },
  ])(
    "rejects $name at the offending position",
    ({ tokens, position, positions = [position] }) => {
      expect(parseTokens(tokens)).toMatchObject({
        ok: false,
        position,
        positions,
        error: expect.stringMatching(/./),
      });
    },
  );
});

describe("parentheses", () => {
  const a = filterToken(numberFilter(createQuery(), "TOTAL", ">", 100));
  const b = filterToken(numberFilter(createQuery(), "TAX", ">", 2));
  const c = filterToken(numberFilter(createQuery(), "QUANTITY", ">", 3));
  const and = opToken("and");
  const or = opToken("or");

  describe("insertParen", () => {
    it("adds the closing parenthesis after the caret", () => {
      expect(insertParen([], 0, "open")).toEqual({
        tokens: [OPEN_PAREN, CLOSE_PAREN],
        caret: 1,
      });
    });

    it("adds the connector and the closing parenthesis after a filter", () => {
      expect(insertParen([a], 1, "open")).toEqual({
        tokens: [a, and, OPEN_PAREN, CLOSE_PAREN],
        caret: 3,
      });
    });

    it("adds no closing parenthesis right before a filter it will wrap", () => {
      expect(insertParen([a, or, b], 0, "open")).toEqual({
        tokens: [OPEN_PAREN, a, or, b],
        caret: 1,
      });
    });

    it("steps over a closing parenthesis instead of repeating it", () => {
      const tokens = [OPEN_PAREN, a, CLOSE_PAREN];
      const next = insertParen(tokens, 2, "close");
      expect(next.tokens).toBe(tokens);
      expect(next.caret).toBe(3);
    });

    it("adds a closing parenthesis when none is next to the caret", () => {
      expect(insertParen([OPEN_PAREN, a], 2, "close")).toEqual({
        tokens: [OPEN_PAREN, a, CLOSE_PAREN],
        caret: 3,
      });
    });
  });

  describe("closeUnclosedGroups", () => {
    it.each<{ name: string; tokens: Token[]; closes: number }>([
      { name: "a lone filter", tokens: [OPEN_PAREN, a], closes: 1 },
      { name: "an OR", tokens: [OPEN_PAREN, a, or, b], closes: 1 },
      { name: "an AND", tokens: [OPEN_PAREN, a, and, b], closes: 1 },
      {
        name: "a group after other filters",
        tokens: [a, and, OPEN_PAREN, b, or, c],
        closes: 1,
      },
      {
        name: "nested groups",
        tokens: [OPEN_PAREN, a, or, OPEN_PAREN, b, and, c],
        closes: 2,
      },
      {
        name: "a closed group of another kind inside",
        tokens: [OPEN_PAREN, a, or, OPEN_PAREN, b, and, c, CLOSE_PAREN],
        closes: 1,
      },
    ])("closes $name at the end", ({ tokens, closes }) => {
      const closed = closeUnclosedGroups(tokens);
      expect(closed).toEqual([
        ...tokens,
        ...Array.from({ length: closes }, () => CLOSE_PAREN),
      ]);
      expect(parseTokens(closed).ok).toBe(true);
    });

    it.each<{ name: string; tokens: Token[] }>([
      {
        name: "a group that mixes AND and OR, which could end earlier",
        tokens: [OPEN_PAREN, a, or, b, and, c],
      },
      { name: "a balanced expression", tokens: [OPEN_PAREN, a, CLOSE_PAREN] },
      { name: "a dangling connector", tokens: [OPEN_PAREN, a, or] },
      { name: "an empty group", tokens: [OPEN_PAREN] },
      { name: "a stray closing parenthesis", tokens: [a, CLOSE_PAREN] },
    ])("leaves $name as it is", ({ tokens }) => {
      expect(closeUnclosedGroups(tokens)).toBe(tokens);
    });
  });

  describe("settleConnectors", () => {
    it("closes a group on leaving, once the dangling connector is gone", () => {
      expect(settleConnectors([OPEN_PAREN, a, or, b, or])).toEqual([
        OPEN_PAREN,
        a,
        or,
        b,
        CLOSE_PAREN,
      ]);
    });

    it("drops a group with nothing in it", () => {
      expect(settleConnectors([a, and, OPEN_PAREN])).toEqual([a]);
      expect(settleConnectors([a, and, OPEN_PAREN, CLOSE_PAREN])).toEqual([a]);
    });

    it("keeps an ambiguous group for the user to fix", () => {
      expect(settleConnectors([OPEN_PAREN, a, or, b, and, c])).toEqual([
        OPEN_PAREN,
        a,
        or,
        b,
        and,
        c,
      ]);
    });
  });
});

describe("insertToken", () => {
  const a = filterToken(numberFilter(createQuery(), "TOTAL", ">", 100));
  const b = filterToken(numberFilter(createQuery(), "TAX", ">", 2));
  const c = filterToken(numberFilter(createQuery(), "QUANTITY", ">", 3));

  it("adds an implicit and between two filters", () => {
    const { tokens, caret } = insertToken([a], 1, b);
    expect(tokens).toEqual([a, opToken("and"), b]);
    expect(caret).toBe(3);
  });

  it("adds an implicit and on both sides of a filter typed between two others", () => {
    const { tokens, caret } = insertToken([a, c], 1, b);
    expect(tokens).toEqual([a, opToken("and"), b, opToken("and"), c]);
    // The caret lands right after the inserted filter, before the trailing and.
    expect(caret).toBe(3);
  });

  it("adds no and before an operator", () => {
    const { tokens, caret } = insertToken([a, opToken("or"), c], 1, b);
    expect(tokens).toEqual([a, opToken("and"), b, opToken("or"), c]);
    expect(caret).toBe(3);
  });

  it("adds no operator around a parenthesis that opens a group", () => {
    const { tokens } = insertToken([a, opToken("or")], 2, OPEN_PAREN);
    expect(tokens).toEqual([a, opToken("or"), OPEN_PAREN]);
  });
});

describe("removePillAt", () => {
  const a = filterToken(numberFilter(createQuery(), "TOTAL", ">", 100));
  const b = filterToken(numberFilter(createQuery(), "TAX", ">", 2));

  it("drops the operator before a removed last pill", () => {
    expect(removePillAt([a, opToken("or"), b], 2)).toEqual([a]);
  });

  it("drops the operator after a removed first pill", () => {
    expect(removePillAt([a, opToken("or"), b], 0)).toEqual([b]);
  });

  it("keeps the expression valid inside a group", () => {
    expect(
      removePillAt([OPEN_PAREN, a, opToken("or"), b, CLOSE_PAREN], 1),
    ).toEqual([OPEN_PAREN, b, CLOSE_PAREN]);
  });
});

describe("removeParenPair", () => {
  const a = filterToken(numberFilter(createQuery(), "TOTAL", ">", 100));
  const b = filterToken(numberFilter(createQuery(), "TAX", ">", 2));
  const c = filterToken(numberFilter(createQuery(), "QUANTITY", ">", 3));
  const group = [
    OPEN_PAREN,
    a,
    opToken("or"),
    b,
    CLOSE_PAREN,
    opToken("and"),
    c,
  ];

  it("removes an opening parenthesis with its closing one", () => {
    expect(removeParenPair(group, 0)).toEqual([
      a,
      opToken("or"),
      b,
      opToken("and"),
      c,
    ]);
  });

  it("removes a closing parenthesis with its opening one", () => {
    expect(removeParenPair(group, 4)).toEqual([
      a,
      opToken("or"),
      b,
      opToken("and"),
      c,
    ]);
  });

  it("matches nested pairs by depth", () => {
    const nested = [
      OPEN_PAREN,
      OPEN_PAREN,
      a,
      CLOSE_PAREN,
      opToken("or"),
      b,
      CLOSE_PAREN,
    ];
    expect(removeParenPair(nested, 0)).toEqual([
      OPEN_PAREN,
      a,
      CLOSE_PAREN,
      opToken("or"),
      b,
    ]);
  });

  it("removes a lone parenthesis on its own", () => {
    expect(removeParenPair([a, CLOSE_PAREN], 1)).toEqual([a]);
  });
});

describe("readTokens and writeTokens", () => {
  it("reads top-level filters as an implicit and chain", () => {
    const query = createQuery();
    const filtered = [
      numberFilter(query, "TOTAL", ">", 100),
      numberFilter(query, "TAX", ">", 2),
    ].reduce((q, clause) => Lib.filter(q, STAGE_INDEX, clause), query);

    expect(describeTokens(filtered, readTokens(filtered, STAGE_INDEX))).toBe(
      "Total is greater than 100 and Tax is greater than 2",
    );
  });

  it("round-trips (a or b) and c through the query", () => {
    const query = createQuery();
    const tokens: Token[] = [
      OPEN_PAREN,
      filterToken(numberFilter(query, "TOTAL", ">", 100)),
      opToken("or"),
      filterToken(numberFilter(query, "TAX", ">", 2)),
      CLOSE_PAREN,
      opToken("and"),
      filterToken(numberFilter(query, "QUANTITY", ">", 3)),
    ];

    const written = writeTokens(query, STAGE_INDEX, tokens);
    const filters = Lib.filters(written, STAGE_INDEX);
    expect(filters).toHaveLength(2);
    expect(Lib.expressionParts(written, STAGE_INDEX, filters[0]).operator).toBe(
      "or",
    );

    expect(describeTokens(written, readTokens(written, STAGE_INDEX))).toBe(
      "( Total is greater than 100 or Tax is greater than 2 ) and Quantity is greater than 3",
    );
  });

  it("writes a top-level or as one filter clause", () => {
    const query = createQuery();
    const tokens: Token[] = [
      filterToken(numberFilter(query, "TOTAL", ">", 100)),
      opToken("or"),
      filterToken(numberFilter(query, "TAX", ">", 2)),
    ];

    const written = writeTokens(query, STAGE_INDEX, tokens);
    expect(Lib.filters(written, STAGE_INDEX)).toHaveLength(1);
    expect(describeTokens(written, readTokens(written, STAGE_INDEX))).toBe(
      "Total is greater than 100 or Tax is greater than 2",
    );
  });

  it("leaves the query alone when the expression does not parse", () => {
    const query = Lib.filter(
      createQuery(),
      STAGE_INDEX,
      numberFilter(createQuery(), "TOTAL", ">", 100),
    );
    const tokens = [...readTokens(query, STAGE_INDEX), opToken("or")];

    expect(writeTokens(query, STAGE_INDEX, tokens)).toBe(query);
  });

  it("clears the stage for an empty expression", () => {
    const query = Lib.filter(
      createQuery(),
      STAGE_INDEX,
      numberFilter(createQuery(), "TOTAL", ">", 100),
    );

    expect(
      Lib.filters(writeTokens(query, STAGE_INDEX, []), STAGE_INDEX),
    ).toHaveLength(0);
  });
});

describe("matchLogic", () => {
  it.each([
    ["o", "OR"],
    ["OR", "OR"],
    ["|", "OR"],
    ["an", "AND"],
    ["&&", "AND"],
    ["(", "("],
    [")", ")"],
  ])("matches %p to %p", (text, label) => {
    expect(matchLogic(text)?.label).toBe(label);
  });

  it.each(["", "  ", "total", "ora"])("matches nothing for %p", (text) => {
    expect(matchLogic(text)).toBeUndefined();
  });
});

describe("getSummaryStageIndex", () => {
  it("is undefined without a summary", () => {
    expect(getSummaryStageIndex(createQuery())).toBeUndefined();
  });

  it("is the stage after the last aggregated one", () => {
    const query = createQuery();
    const operators = Lib.availableAggregationOperators(query, STAGE_INDEX);
    const count = operators.find(
      (operator) =>
        Lib.displayInfo(query, STAGE_INDEX, operator).shortName === "count",
    );
    const aggregated = Lib.aggregate(
      query,
      STAGE_INDEX,
      Lib.aggregationClause(checkNotNull(count)),
    );

    expect(getSummaryStageIndex(aggregated)).toBe(1);
    expect(getSummaryStageIndex(Lib.appendStage(aggregated))).toBe(1);
  });
});

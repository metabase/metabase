import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import { getFilterLabel } from "../../harness/clauses";
import {
  withDnfExample,
  withNestedExample,
  withPillsExample,
} from "../../harness/examples";

import { OPEN_PAREN, readTokens, writeAndContext } from "./tokens";

type Example = (query: Lib.Query, stageIndex: number) => Lib.Query;

function setup(example: Example) {
  const query = example(
    Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
    0,
  );
  const tokens = readTokens(query, 0);
  const findClause = (columnName: string) => {
    const token = tokens.find(
      (token) =>
        token.type === "filter" &&
        getFilterLabel(query, 0, token.clause).startsWith(columnName),
    );
    if (token?.type !== "filter") {
      throw new Error(`Could not find the ${columnName} filter`);
    }
    return token.clause;
  };
  return { query, tokens, findClause };
}

function getFilterNames(query: Lib.Query | undefined): string[] | undefined {
  if (query == null) {
    return undefined;
  }
  return Lib.filters(query, 0).map((filter) =>
    getFilterLabel(query, 0, filter),
  );
}

describe("writeAndContext", () => {
  it.each([
    [
      "Subtotal",
      [
        "Total is greater than 100",
        "Quantity is greater than 3",
        "Discount is empty",
      ],
    ],
    ["Tax", ["Total is greater than 100", "Quantity is greater than 3"]],
    [
      "Total",
      [
        "Quantity is greater than 3",
        "Tax is greater than 2 or Discount is empty and Subtotal is less than 50",
      ],
    ],
  ])(
    "keeps only the filters AND-ed with the %s filter",
    (columnName, expectedNames) => {
      const { query, tokens, findClause } = setup(withNestedExample);
      const context = writeAndContext(query, 0, tokens, findClause(columnName));
      expect(getFilterNames(context)).toEqual(expectedNames);
    },
  );

  it("leaves out the other branches of an OR", () => {
    const { query, tokens, findClause } = setup(withDnfExample);
    expect(
      getFilterNames(writeAndContext(query, 0, tokens, findClause("Total"))),
    ).toEqual(["Quantity is greater than 3"]);
    expect(
      getFilterNames(writeAndContext(query, 0, tokens, findClause("Tax"))),
    ).toEqual([]);
  });

  it("keeps a whole OR group AND-ed with a top-level filter", () => {
    const { query, tokens, findClause } = setup(withPillsExample);
    expect(
      getFilterNames(writeAndContext(query, 0, tokens, findClause("Quantity"))),
    ).toEqual(["Total is greater than 100 or Tax is greater than 2"]);
  });

  it("returns undefined for tokens that don't parse", () => {
    const { query, tokens, findClause } = setup(withDnfExample);
    expect(
      writeAndContext(query, 0, [OPEN_PAREN, ...tokens], findClause("Total")),
    ).toBeUndefined();
  });
});

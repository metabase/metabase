import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  columnFinder,
} from "metabase-lib/test-helpers";
import { PRODUCTS_ID } from "metabase-types/api/mocks/presets";

import {
  type DeserializeResult,
  FILTER_CLIPBOARD_TYPE,
  type FilterClipboardPayload,
  deserializeTokens,
  getClipboardEntries,
  getTokensText,
  parseFilterClipboard,
  serializeTokens,
} from "./clipboard";
import {
  CLOSE_PAREN,
  OPEN_PAREN,
  type Token,
  filterToken,
  getFilterLabel,
  opToken,
  toFilterClause,
} from "./tokens";

const STAGE_INDEX = 0;

function createOrdersQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
}

function createProductsQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
  });
}

function numberFilter(
  query: Lib.Query,
  tableName: string,
  columnName: string,
  value: number,
) {
  const column = columnFinder(query, Lib.filterableColumns(query, STAGE_INDEX))(
    tableName,
    columnName,
  );
  return filterToken(
    toFilterClause(
      query,
      STAGE_INDEX,
      Lib.numberFilterClause({ operator: ">", column, values: [value] }),
    ),
  );
}

function describeTokens(query: Lib.Query, tokens: readonly Token[]) {
  return tokens.map((token) => {
    switch (token.type) {
      case "filter":
        return getFilterLabel(query, STAGE_INDEX, token.clause);
      case "op":
        return token.op;
      case "paren":
        return token.side === "open" ? "(" : ")";
    }
  });
}

function roundTrip(payload: FilterClipboardPayload) {
  const parsed = parseFilterClipboard(JSON.stringify(payload));
  if (parsed == null) {
    throw new Error("The payload did not survive the clipboard");
  }
  return parsed;
}

function getPastedTokens(result: DeserializeResult) {
  if (!result.ok) {
    throw new Error(`The paste was refused: ${result.reason}`);
  }
  return result;
}

describe("filter clipboard", () => {
  const query = createOrdersQuery();
  const tokens: Token[] = [
    numberFilter(query, "ORDERS", "TOTAL", 10),
    opToken("and"),
    OPEN_PAREN,
    numberFilter(query, "ORDERS", "TAX", 5),
    opToken("or"),
    numberFilter(query, "PRODUCTS", "PRICE", 1),
    CLOSE_PAREN,
  ];

  it("spells the tokens like the bar, with explicit ands and tight parentheses", () => {
    const [total, , , tax, , price] = describeTokens(query, tokens);
    expect(getTokensText(query, STAGE_INDEX, tokens)).toBe(
      `${total} and (${tax} or ${price})`,
    );
  });

  it("rebuilds the same tokens from the payload on another query of the same table", () => {
    const payload = roundTrip(serializeTokens(query, STAGE_INDEX, tokens));
    const target = createOrdersQuery();
    const result = getPastedTokens(
      deserializeTokens(target, STAGE_INDEX, payload),
    );
    expect(result.skippedCount).toBe(0);
    expect(describeTokens(target, result.tokens)).toEqual(
      describeTokens(query, tokens),
    );
  });

  it("writes both a text and a structured entry", () => {
    const entries = getClipboardEntries(query, STAGE_INDEX, tokens);
    expect(entries?.["text/plain"]).toBe(
      getTokensText(query, STAGE_INDEX, tokens),
    );
    expect(parseFilterClipboard(entries?.[FILTER_CLIPBOARD_TYPE])).toEqual(
      serializeTokens(query, STAGE_INDEX, tokens),
    );
  });

  it("refuses a payload from another database", () => {
    const payload = {
      ...serializeTokens(query, STAGE_INDEX, tokens),
      databaseId: 999,
    };
    expect(deserializeTokens(query, STAGE_INDEX, payload)).toEqual({
      ok: false,
      reason: "database",
    });
  });

  it("skips every filter whose column the target does not have, with the connectors and parentheses left over", () => {
    // Products' Price reaches Orders through a foreign key, so even that ref
    // is not the Products table's own: only a ref match counts.
    const payload = roundTrip(serializeTokens(query, STAGE_INDEX, tokens));
    const target = createProductsQuery();
    expect(deserializeTokens(target, STAGE_INDEX, payload)).toEqual({
      ok: true,
      tokens: [],
      skippedCount: 3,
    });
  });

  it("drops the connector before a skipped filter, so the rest stays valid", () => {
    const payload = roundTrip(
      serializeTokens(query, STAGE_INDEX, [
        tokens[0],
        opToken("and"),
        tokens[3],
      ]),
    );
    const [, , tax] = payload.tokens;
    if (tax.type !== "filter") {
      throw new Error("Expected a filter token");
    }
    tax.parts.args[0] = { ref: ["field", 999_999, null] };

    const result = getPastedTokens(
      deserializeTokens(query, STAGE_INDEX, payload),
    );

    expect(result.skippedCount).toBe(1);
    expect(describeTokens(query, result.tokens)).toEqual([
      describeTokens(query, tokens)[0],
    ]);
  });

  it.each([
    ["plain text", "Total is greater than 10"],
    ["broken JSON", "{"],
    ["another version", JSON.stringify({ version: 2, tokens: [] })],
    ["no tokens", JSON.stringify({ version: 1, databaseId: 1 })],
    ["empty", ""],
    ["nothing", undefined],
  ])("ignores %s on the clipboard", (_name, data) => {
    expect(parseFilterClipboard(data)).toBeUndefined();
  });
});

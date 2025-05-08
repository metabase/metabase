import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import {
  setupErrorFixNativeQueryEndpoint,
  setupFixNativeQueryEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA, createQuery } from "metabase-lib/test-helpers";
import type {
  DatasetError,
  DatasetErrorType,
  FixSqlQueryResponse,
} from "metabase-types/api";
import {
  createMockFixSqlQueryResponse,
  createMockSqlQueryFix,
} from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { FixSqlQueryButton } from "./FixSqlQueryButton";

type SetupOpts = {
  query?: Lib.Query;
  queryError?: DatasetError;
  queryErrorType?: DatasetErrorType;
  fixQueryResponse?: FixSqlQueryResponse;
};

function setup({
  query = createNativeQuery("SELECT * FROM ORDERS"),
  queryError = "Error",
  queryErrorType = "invalid-query",
  fixQueryResponse,
}: SetupOpts) {
  const onQueryFix = jest.fn();
  const onHighlightLines = jest.fn();

  if (fixQueryResponse) {
    setupFixNativeQueryEndpoint(fixQueryResponse);
  } else {
    setupErrorFixNativeQueryEndpoint();
  }

  renderWithProviders(
    <FixSqlQueryButton
      query={query}
      queryError={queryError}
      queryErrorType={queryErrorType}
      onQueryFix={onQueryFix}
      onHighlightLines={onHighlightLines}
    />,
  );

  return { onQueryFix, onHighlightLines };
}

function createNativeQuery(rawQuery: string) {
  const metadataProvider = Lib.metadataProvider(SAMPLE_DB_ID, SAMPLE_METADATA);
  return Lib.nativeQuery(SAMPLE_DB_ID, metadataProvider, rawQuery);
}

describe("FixSqlQueryButton", () => {
  it("should allow to apply a single query fix", async () => {
    const { onQueryFix } = setup({
      query: createNativeQuery("SELECT1 * FROM ORDERS"),
      fixQueryResponse: createMockFixSqlQueryResponse({
        fixes: [
          createMockSqlQueryFix({
            fixed_sql: "SELECT * FROM ORDERS",
            line_number: 1,
          }),
        ],
      }),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: /Have Metabot fix it/ }),
    );

    const [fixedQuery, lineNumbers] = onQueryFix.mock.lastCall;
    expect(Lib.rawNativeQuery(fixedQuery)).toBe("SELECT * FROM ORDERS");
    expect(lineNumbers).toEqual([1]);
  });

  it("should allow to apply multiple query fixes", async () => {
    const { onQueryFix } = setup({
      query: createNativeQuery("SELECT1 *\nFROM2 ORDERS\nWHERE 1=1"),
      fixQueryResponse: createMockFixSqlQueryResponse({
        fixes: [
          createMockSqlQueryFix({
            fixed_sql: "SELECT *",
            line_number: 1,
          }),
          createMockSqlQueryFix({
            fixed_sql: "FROM ORDERS",
            line_number: 2,
          }),
        ],
      }),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: /Have Metabot fix it/ }),
    );

    const [fixedQuery, lineNumbers] = onQueryFix.mock.lastCall;
    expect(Lib.rawNativeQuery(fixedQuery)).toBe(
      "SELECT *\nFROM ORDERS\nWHERE 1=1",
    );
    expect(lineNumbers).toEqual([1, 2]);
  });

  it("should highlight affected lines on hover", async () => {
    const { onHighlightLines } = setup({
      query: createNativeQuery("SELECT1 * FROM ORDERS"),
      fixQueryResponse: createMockFixSqlQueryResponse({
        fixes: [
          createMockSqlQueryFix({
            fixed_sql: "SELECT * FROM ORDERS",
            line_number: 1,
          }),
        ],
      }),
    });
    await userEvent.hover(
      await screen.findByRole("button", { name: /Have Metabot fix it/ }),
    );
    expect(onHighlightLines).toHaveBeenLastCalledWith([1]);
  });

  it("should show an error message when fixes are empty", async () => {
    setup({
      query: createNativeQuery("SELECT1 * FROM ORDERS"),
      fixQueryResponse: createMockFixSqlQueryResponse({
        fixes: [],
      }),
    });

    expect(
      await screen.findByRole("button", { name: /Metabot can't fix it/ }),
    ).toBeInTheDocument();
  });

  it("should show an error message when the endpoint returns an error", async () => {
    setup({
      query: createNativeQuery("SELECT1 * FROM ORDERS"),
      fixQueryResponse: undefined,
    });

    expect(
      await screen.findByRole("button", { name: /Metabot can't fix it/ }),
    ).toBeInTheDocument();
  });

  it("should not prompt to a fix a non-native query", () => {
    setup({ query: createQuery() });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("should not prompt to fix a non-sql native query", () => {
    const metadata = createMockMetadata({
      databases: [createSampleDatabase({ engine: "mongo" })],
    });
    const metadataProvider = Lib.metadataProvider(SAMPLE_DB_ID, metadata);
    const query = Lib.nativeQuery(SAMPLE_DB_ID, metadataProvider, "{}");
    setup({ query });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("should not prompt to a fix the query when there is an http error", () => {
    setup({ queryError: { status: 500 } });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("should not prompt to a fix the query for unrelated error types", () => {
    setup({ queryErrorType: "missing-required-parameter" });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

import userEvent from "@testing-library/user-event";

import {
  setupErrorFixNativeQueryEndpoint,
  setupFixNativeQueryEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import type {
  DatasetError,
  DatasetErrorType,
  FixSqlQueryResponse,
} from "metabase-types/api";
import {
  createMockFixSqlQueryResponse,
  createMockSqlQueryFix,
} from "metabase-types/api/mocks";
import { SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

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
    />,
  );

  const getFixedQuery = () => {
    const [fixedQuery] = onQueryFix.mock.lastCall;
    return fixedQuery;
  };

  return { onQueryFix, getFixedQuery };
}

function createNativeQuery(rawQuery: string) {
  const metadataProvider = Lib.metadataProvider(SAMPLE_DB_ID, SAMPLE_METADATA);
  return Lib.nativeQuery(SAMPLE_DB_ID, metadataProvider, rawQuery);
}

describe("FixSqlQueryButton", () => {
  it("should allow to apply a single query fix", async () => {
    const { getFixedQuery } = setup({
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

    await userEvent.click(await screen.findByText("Have Metabot fix it"));

    const fixedQuery = getFixedQuery();
    expect(Lib.rawNativeQuery(fixedQuery)).toBe("SELECT * FROM ORDERS");
  });

  it("should allow to apply multiple query fixes", async () => {
    const { getFixedQuery } = setup({
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

    await userEvent.click(await screen.findByText("Have Metabot fix it"));

    const fixedQuery = getFixedQuery();
    expect(Lib.rawNativeQuery(fixedQuery)).toBe(
      "SELECT *\nFROM ORDERS\nWHERE 1=1",
    );
  });

  it("should show an error message when fixes are empty", async () => {
    setup({
      query: createNativeQuery("SELECT1 * FROM ORDERS"),
      fixQueryResponse: createMockFixSqlQueryResponse({
        fixes: [],
      }),
    });

    expect(await screen.findByText("Metabot can't fix it")).toBeInTheDocument();
  });

  it("should show an error message when the endpoint returns an error", async () => {
    setup({
      query: createNativeQuery("SELECT1 * FROM ORDERS"),
      fixQueryResponse: undefined,
    });

    expect(await screen.findByText("Metabot can't fix it")).toBeInTheDocument();
  });
});

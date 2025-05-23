import userEvent from "@testing-library/user-event";

import { setupGenerateSqlQueryEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import type { GenerateSqlQueryResponse } from "metabase-types/api";
import { createMockGenerateSqlQueryResponse } from "metabase-types/api/mocks";
import { SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import { GenerateSqlQueryButton } from "./GenerateSqlQueryButton";

type SetupOpts = {
  query: Lib.Query;
  generateQueryResponse?: GenerateSqlQueryResponse;
  selectedQueryText?: string;
};

function setup({ query, generateQueryResponse, selectedQueryText }: SetupOpts) {
  const onGenerateQuery = jest.fn();

  if (generateQueryResponse) {
    setupGenerateSqlQueryEndpoint(generateQueryResponse);
  }

  renderWithProviders(
    <GenerateSqlQueryButton
      query={query}
      selectedQueryText={selectedQueryText}
      onGenerateQuery={onGenerateQuery}
    />,
  );

  return { onGenerateQuery };
}

function getNativeQuery(queryText: string) {
  const metadataProvider = Lib.metadataProvider(SAMPLE_DB_ID, SAMPLE_METADATA);
  return Lib.nativeQuery(SAMPLE_DB_ID, metadataProvider, queryText);
}

const SQL = "SELECT 1";

describe("GenerateSqlQueryButton", () => {
  it.each([
    { query: "-- show orders", prompt: "show orders" },
    { query: "SELECT 1;\n-- show orders\nSELECT 2;", prompt: "show orders" },
  ])(
    'should generate SQL based on the prompt in the query "$query"',
    async ({ query, prompt }) => {
      const { onGenerateQuery } = setup({
        query: getNativeQuery(query),
        generateQueryResponse: createMockGenerateSqlQueryResponse({
          generated_sql: SQL,
        }),
      });
      await userEvent.click(screen.getByRole("button"));
      await waitFor(() =>
        expect(onGenerateQuery).toHaveBeenCalledWith(`-- ${prompt}\n${SQL}`),
      );
    },
  );

  it.each([" ", "-- ", "SELECT 1"])(
    'should be disabled when there is no prompt in the query "%s"',
    async (query) => {
      setup({
        query: getNativeQuery(query),
      });
      expect(screen.getByRole("button")).toBeDisabled();
    },
  );
});

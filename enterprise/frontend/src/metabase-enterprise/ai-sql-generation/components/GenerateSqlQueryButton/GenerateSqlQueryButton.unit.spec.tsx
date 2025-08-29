import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupErrorGenerateSqlQueryEndpoint,
  setupGenerateSqlQueryEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import type { GenerateSqlQueryResponse } from "metabase-types/api";
import {
  createMockGenerateSqlQueryResponse,
  createMockSettings,
} from "metabase-types/api/mocks";
import { SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import { GenerateSqlQueryButton } from "./GenerateSqlQueryButton";

type SetupOpts = {
  query: Lib.Query;
  generateQueryResponse?: GenerateSqlQueryResponse;
  selectedQueryText?: string;
  metabotFeatureEnabled?: boolean;
};

function setup({
  query,
  generateQueryResponse,
  selectedQueryText,
  metabotFeatureEnabled = true,
}: SetupOpts) {
  const onGenerateQuery = jest.fn();

  setupEnterprisePlugins();
  setupPropertiesEndpoints(
    createMockSettings({ "metabot-feature-enabled": metabotFeatureEnabled }),
  );

  if (generateQueryResponse) {
    setupGenerateSqlQueryEndpoint(generateQueryResponse);
  } else {
    setupErrorGenerateSqlQueryEndpoint();
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
      await userEvent.click(await screen.findByRole("button"));
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
      expect(await screen.findByRole("button")).toBeDisabled();
    },
  );

  it.each([
    {
      query: "SELECT 1; -- show orders and show products",
      selectedQueryText: " show products",
      prompt: "show products",
    },
  ])(
    'should generate SQL based on the selected query text "selectedQueryText"',
    async ({ query, selectedQueryText, prompt }) => {
      const { onGenerateQuery } = setup({
        query: getNativeQuery(query),
        selectedQueryText,
        generateQueryResponse: createMockGenerateSqlQueryResponse({
          generated_sql: SQL,
        }),
      });
      await userEvent.click(await screen.findByRole("button"));
      await waitFor(() =>
        expect(onGenerateQuery).toHaveBeenCalledWith(`-- ${prompt}\n${SQL}`),
      );
    },
  );

  it("should ignore errors from the endpoint", async () => {
    const { onGenerateQuery } = setup({
      query: getNativeQuery("-- prompt"),
    });
    await userEvent.click(await screen.findByRole("button"));
    await waitFor(() =>
      expect(
        fetchMock.callHistory.called("path:/api/ee/ai-sql-generation/generate"),
      ).toBe(true),
    );
    await waitFor(async () =>
      expect(await screen.findByRole("button")).toBeEnabled(),
    );
    expect(onGenerateQuery).not.toHaveBeenCalled();
  });

  describe("feature toggle", () => {
    it("should render when metabot feature is enabled", async () => {
      setup({
        query: getNativeQuery("-- get all the orders"),
        metabotFeatureEnabled: true,
      });

      expect(
        await screen.findByRole("button", {
          name: "Generate SQL based on the prompt",
        }),
      ).toBeInTheDocument();
    });

    it("should not render when metabot feature is disabled", () => {
      setup({
        query: getNativeQuery("-- get all the orders"),
        metabotFeatureEnabled: false,
      });

      expect(
        screen.queryByRole("button", {
          name: "Generate SQL based on the prompt",
        }),
      ).not.toBeInTheDocument();
    });
  });
});

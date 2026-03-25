import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import {
  setupDatabasesEndpoints,
  setupUnauthorizedDatabasesEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { formatNumber } from "metabase/lib/formatting";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";
import type { Card, Dataset, UnsavedCard } from "metabase-types/api";
import {
  createMockDataset,
  type createMockSettings,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createAdHocCard,
  createAdHocNativeCard,
  createSampleDatabase,
  createSavedNativeCard,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";
import {
  createMockQueryBuilderState,
  createMockSettingsState,
} from "metabase-types/store/mocks";

import { QuestionRowCount } from "./QuestionRowCount";

type SetupOpts = {
  question: Card | UnsavedCard;
  result?: Dataset;
  isResultDirty?: boolean;
  isReadOnly?: boolean;
  settings?: Partial<Parameters<typeof createMockSettings>[0]>;
};

function patchQuestion(question: Question) {
  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(question.query());
  if (!isNative) {
    const [sampleColumn] = Lib.orderableColumns(query, 0);
    const nextQuery = Lib.orderBy(query, 0, sampleColumn);
    return question.setQuery(nextQuery);
  } else {
    const query = question.legacyNativeQuery() as NativeQuery;
    return query.setQueryText("SELECT * FROM __ORDERS__").question();
  }
}

async function setup({
  question: card,
  result = createMockDataset(),
  isResultDirty = false,
  isReadOnly = false,
  settings = {},
}: SetupOpts) {
  const databases = [createSampleDatabase()];
  const metadata = createMockMetadata({
    databases,
    questions: "id" in card ? [card] : [],
  });
  const question =
    "id" in card
      ? checkNotNull(metadata.question(card.id))
      : new Question(card, metadata);

  if (isReadOnly) {
    setupUnauthorizedDatabasesEndpoints(databases);
  } else {
    setupDatabasesEndpoints(databases);
  }

  const lastRunQuestion = isResultDirty ? patchQuestion(question) : question;
  const lastRunDatasetQuery = lastRunQuestion.datasetQuery();

  result.json_query = lastRunDatasetQuery;

  const state = createMockQueryBuilderState({
    card: question.card(),
    lastRunCard: lastRunQuestion.card(),
    queryResults: [result],
  });

  renderWithProviders(<QuestionRowCount />, {
    storeInitialState: {
      qb: state,
      settings: createMockSettingsState(settings),
      entities: createMockEntitiesState({
        databases: isReadOnly ? [] : databases,
        questions: "id" in card ? [card] : [],
      }),
    },
  });

  const rowCount = await screen.findByLabelText("Row count");

  return { rowCount };
}

function getDatasetQueryWithLimit(limit: number) {
  return createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: { "source-table": ORDERS_ID, limit },
  });
}

describe("QuestionRowCount", () => {
  describe("structured query", () => {
    [
      { getCard: createAdHocCard, type: "ad-hoc" },
      { getCard: createSavedStructuredCard, type: "saved" },
    ].forEach(({ getCard, type }) => {
      describe(type, () => {
        it("shows real row count when limit isn't set", async () => {
          const { rowCount } = await setup({
            question: getCard(),
            result: createMockDataset({ row_count: 80 }),
          });
          expect(rowCount).toHaveTextContent("Showing 80 rows");
        });

        it("shows real row count when results are not dirty", async () => {
          const { rowCount } = await setup({
            question: getCard({ dataset_query: getDatasetQueryWithLimit(25) }),
            result: createMockDataset({ row_count: 80 }),
            isResultDirty: false,
          });
          expect(rowCount).toHaveTextContent("Showing 80 rows");
        });

        it("shows applied limit if results are dirty", async () => {
          const { rowCount } = await setup({
            question: getCard({ dataset_query: getDatasetQueryWithLimit(25) }),
            result: createMockDataset(),
            isResultDirty: true,
          });

          expect(rowCount).toHaveTextContent("Show 25 rows");
        });

        it("shows real row count when limit is above the hard limit", async () => {
          const { rowCount } = await setup({
            question: getCard({
              dataset_query: getDatasetQueryWithLimit(HARD_ROW_LIMIT + 1),
            }),
            result: createMockDataset({ row_count: 321 }),
          });

          expect(rowCount).toHaveTextContent("Showing 321 rows");
        });

        it("allows setting a limit", async () => {
          const { rowCount } = await setup({ question: getCard() });

          await userEvent.click(rowCount);
          const input = await screen.findByPlaceholderText("Pick a limit");
          await userEvent.type(input, "25{Enter}");

          await waitFor(() => {
            expect(rowCount).toHaveTextContent("Show 25 rows");
          });
        });

        it("allows updating a limit", async () => {
          const { rowCount } = await setup({
            question: getCard({ dataset_query: getDatasetQueryWithLimit(25) }),
          });

          await userEvent.click(rowCount);
          const input = await screen.findByDisplayValue("25");
          await userEvent.clear(input);
          await userEvent.type(input, "400{Enter}");

          await waitFor(() => {
            expect(rowCount).toHaveTextContent("Show 400 rows");
          });
        });

        it("allows resetting a limit", async () => {
          const { rowCount } = await setup({
            question: getCard({ dataset_query: getDatasetQueryWithLimit(25) }),
          });

          await userEvent.click(rowCount);
          await userEvent.click(
            await screen.findByRole("radio", { name: /Show maximum/i }),
          );

          await waitFor(() =>
            expect(rowCount).toHaveTextContent(
              `Showing first ${formatNumber(HARD_ROW_LIMIT)} rows`,
            ),
          );
        });

        it("doesn't allow managing limit if query is read-only", async () => {
          const { rowCount } = await setup({
            question: getCard(),
            isReadOnly: true,
          });

          expect(
            screen.queryByRole("button", { name: "Row count" }),
          ).not.toBeInTheDocument();

          await userEvent.click(rowCount);

          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
      });
    });
  });

  describe("with custom row limit settings", () => {
    it("uses unaggregated-query-row-limit for queries without aggregations", async () => {
      const { rowCount } = await setup({
        question: createAdHocCard(),
        result: createMockDataset({ row_count: 500 }),
        settings: { "unaggregated-query-row-limit": 500 },
      });

      expect(rowCount).toHaveTextContent(
        `Showing first ${formatNumber(500)} rows`,
      );
    });

    it("uses aggregated-query-row-limit for queries with aggregations", async () => {
      const { rowCount } = await setup({
        question: createAdHocCard({
          dataset_query: createMockStructuredDatasetQuery({
            database: SAMPLE_DB_ID,
            query: {
              "source-table": ORDERS_ID,
              aggregation: [["count"]],
            },
          }),
        }),
        result: createMockDataset({ row_count: 5000 }),
        settings: { "aggregated-query-row-limit": 5000 },
      });

      expect(rowCount).toHaveTextContent(
        `Showing first ${formatNumber(5000)} rows`,
      );
    });

    it("shows the custom limit in the popover maximum label", async () => {
      const { rowCount } = await setup({
        question: createAdHocCard(),
        settings: { "unaggregated-query-row-limit": 500 },
      });

      await userEvent.click(rowCount);

      expect(
        screen.getByRole("radio", {
          name: `Show maximum (first ${formatNumber(500)})`,
        }),
      ).toBeInTheDocument();
    });

    it("does not allow setting a limit above the configured max", async () => {
      const { rowCount } = await setup({
        question: createAdHocCard(),
        settings: { "unaggregated-query-row-limit": 100 },
      });

      await userEvent.click(rowCount);
      const input = await screen.findByPlaceholderText("Pick a limit");
      await userEvent.type(input, "200{Enter}");

      expect(
        screen.getByText("Value exceeds maximum of 100"),
      ).toBeInTheDocument();

      expect(rowCount).toHaveTextContent("Showing 0 rows");
    });

    it("allows setting a limit at exactly the configured max", async () => {
      const { rowCount } = await setup({
        question: createAdHocCard(),
        settings: { "unaggregated-query-row-limit": 100 },
      });

      await userEvent.click(rowCount);
      const input = await screen.findByPlaceholderText("Pick a limit");
      await userEvent.type(input, "100{Enter}");

      await waitFor(() => {
        expect(rowCount).toHaveTextContent("Show 100 rows");
      });
    });
  });

  describe("native query", () => {
    [
      { getCard: createAdHocNativeCard, type: "ad-hoc" },
      { getCard: createSavedNativeCard, type: "saved" },
    ].forEach(({ getCard, type }) => {
      describe(type, () => {
        it("doesn't show anything when results are dirty", async () => {
          const { rowCount } = await setup({
            question: getCard(),
            isResultDirty: true,
          });
          expect(rowCount).toBeEmptyDOMElement();
        });

        it("shows the real row count", async () => {
          const result = createMockDataset({ row_count: 744 });
          const { rowCount } = await setup({ question: getCard(), result });

          expect(rowCount).toHaveTextContent("Showing 744 rows");
        });

        it("shows the hard limit", async () => {
          const result = createMockDataset({ row_count: HARD_ROW_LIMIT });
          const { rowCount } = await setup({ question: getCard(), result });

          expect(rowCount).toHaveTextContent(
            `Showing first ${formatNumber(HARD_ROW_LIMIT)} rows`,
          );
        });

        it("shows the real row count when limit isn't applied by the query itself", async () => {
          const result = createMockDataset({
            row_count: 70,
            data: { rows_truncated: 1000 },
          });
          const { rowCount } = await setup({ question: getCard(), result });

          expect(rowCount).toHaveTextContent("Showing first 70 rows");
        });

        it("doesn't allow managing limit", async () => {
          const { rowCount } = await setup({
            question: getCard(),
            isReadOnly: true,
          });

          expect(
            screen.queryByRole("button", { name: "Row count" }),
          ).not.toBeInTheDocument();

          await userEvent.click(rowCount);

          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
      });
    });
  });
});

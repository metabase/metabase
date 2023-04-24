import React from "react";
import userEvent from "@testing-library/user-event";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import {
  setupDatabasesEndpoints,
  setupUnauthorizedDatabasesEndpoints,
} from "__support__/server-mocks";

import type { Dataset, DatasetQuery } from "metabase-types/api";
import { createMockDataset } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockQueryBuilderState } from "metabase-types/store/mocks";

import * as Lib from "metabase-lib";
import { HARD_ROW_LIMIT } from "metabase-lib/queries/utils";
import type Question from "metabase-lib/Question";
import type NativeQuery from "metabase-lib/queries/NativeQuery";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import {
  getSavedStructuredQuestion,
  getAdHocQuestion,
  getSavedNativeQuestion,
  getUnsavedNativeQuestion,
} from "metabase-lib/mocks";

import QuestionRowCount from "./QuestionRowCount";

type SetupOpts = {
  question: Question;
  result?: Dataset;
  isResultDirty?: boolean;
  isReadOnly?: boolean;
};

function patchQuestion(question: Question) {
  if (question.isStructured()) {
    const query = question._getMLv2Query();
    const [sampleColumn] = Lib.orderableColumns(query);
    const nextQuery = Lib.orderBy(query, sampleColumn);
    return question.setDatasetQuery(Lib.toLegacyQuery(nextQuery));
  } else {
    const query = question.query() as NativeQuery;
    return query.setQueryText("SELECT * FROM __ORDERS__").question();
  }
}

async function setup({
  question,
  result = createMockDataset(),
  isResultDirty = false,
  isReadOnly = false,
}: SetupOpts) {
  const databases = [createSampleDatabase()];

  if (isReadOnly) {
    setupUnauthorizedDatabasesEndpoints(databases);
  } else {
    setupDatabasesEndpoints(databases);
  }

  const lastRunQuestion = isResultDirty ? patchQuestion(question) : question;
  const lastRunDatasetQuery = lastRunQuestion.datasetQuery() as DatasetQuery;

  result.json_query = lastRunDatasetQuery;

  const state = createMockQueryBuilderState({
    card: question.card(),
    lastRunCard: lastRunQuestion.card(),
    queryResults: [result],
  });

  renderWithProviders(<QuestionRowCount />, {
    storeInitialState: { qb: state },
  });

  const rowCount = await screen.findByLabelText("Row count");

  return { rowCount };
}

describe("QuestionRowCount", () => {
  describe("structured query", () => {
    [
      { question: getAdHocQuestion(), type: "ad-hoc" },
      { question: getSavedStructuredQuestion(), type: "saved" },
    ].forEach(({ question, type }) => {
      describe(type, () => {
        it("shows real row count when limit isn't set", async () => {
          const { rowCount } = await setup({
            question,
            result: createMockDataset({ row_count: 80 }),
          });
          expect(rowCount).toHaveTextContent("Showing 80 rows");
        });

        it("shows real row count when results are not dirty", async () => {
          const query = question.query() as StructuredQuery;
          const { rowCount } = await setup({
            question: query.updateLimit(25).question(),
            result: createMockDataset({ row_count: 80 }),
            isResultDirty: false,
          });

          expect(rowCount).toHaveTextContent("Showing 80 rows");
        });

        it("shows applied limit if results are dirty", async () => {
          const query = question.query() as StructuredQuery;
          const { rowCount } = await setup({
            question: query.updateLimit(25).question(),
            result: createMockDataset(),
            isResultDirty: true,
          });

          expect(rowCount).toHaveTextContent("Show 25 rows");
        });

        it("shows real row count when limit is above the hard limit", async () => {
          const query = question.query() as StructuredQuery;
          const { rowCount } = await setup({
            question: query.updateLimit(HARD_ROW_LIMIT + 1).question(),
            result: createMockDataset({ row_count: 321 }),
          });

          expect(rowCount).toHaveTextContent("Showing 321 rows");
        });

        it("allows setting a limit", async () => {
          const { rowCount } = await setup({ question });

          userEvent.click(rowCount);
          const input = await screen.findByPlaceholderText("Pick a limit");
          fireEvent.change(input, { target: { value: "25" } });
          fireEvent.keyPress(input, { key: "Enter", charCode: 13 });

          await waitFor(() => {
            expect(rowCount).toHaveTextContent("Show 25 rows");
          });
        });

        it("allows updating a limit", async () => {
          const query = question.query() as StructuredQuery;
          const { rowCount } = await setup({
            question: query.updateLimit(25).question(),
          });

          userEvent.click(rowCount);
          const input = await screen.findByDisplayValue("25");
          fireEvent.change(input, { target: { value: "400" } });
          fireEvent.keyPress(input, { key: "Enter", charCode: 13 });

          await waitFor(() => {
            expect(rowCount).toHaveTextContent("Show 400 rows");
          });
        });

        it("allows resetting a limit", async () => {
          const query = question.query() as StructuredQuery;
          const { rowCount } = await setup({
            question: query.updateLimit(25).question(),
          });

          userEvent.click(rowCount);
          userEvent.click(
            await screen.findByRole("radio", { name: /Show maximum/i }),
          );

          await waitFor(() =>
            expect(rowCount).toHaveTextContent(
              `Showing first ${HARD_ROW_LIMIT} rows`,
            ),
          );
        });

        it("doesn't allow managing limit if query is read-only", async () => {
          const { rowCount } = await setup({ question, isReadOnly: true });

          expect(
            screen.queryByRole("button", { name: "Row count" }),
          ).not.toBeInTheDocument();

          userEvent.click(rowCount);

          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
      });
    });
  });

  describe("native query", () => {
    [
      { question: getUnsavedNativeQuestion(), type: "ad-hoc" },
      { question: getSavedNativeQuestion(), type: "saved" },
    ].forEach(({ question, type }) => {
      describe(type, () => {
        it("doesn't show anything when results are dirty", async () => {
          const { rowCount } = await setup({ question, isResultDirty: true });
          expect(rowCount).toBeEmptyDOMElement();
        });

        it("shows the real row count", async () => {
          const result = createMockDataset({ row_count: 744 });
          const { rowCount } = await setup({ question, result });

          expect(rowCount).toHaveTextContent("Showing 744 rows");
        });

        it("shows the hard limit", async () => {
          const result = createMockDataset({ row_count: HARD_ROW_LIMIT });
          const { rowCount } = await setup({ question, result });

          expect(rowCount).toHaveTextContent(
            `Showing first ${HARD_ROW_LIMIT} rows`,
          );
        });

        it("shows the real row count when limit isn't applied by the query itself", async () => {
          const result = createMockDataset({
            row_count: 70,
            data: { rows_truncated: 1000 },
          });
          const { rowCount } = await setup({ question, result });

          expect(rowCount).toHaveTextContent("Showing first 70 rows");
        });

        it("doesn't allow managing limit", async () => {
          const { rowCount } = await setup({ question, isReadOnly: true });

          expect(
            screen.queryByRole("button", { name: "Row count" }),
          ).not.toBeInTheDocument();

          userEvent.click(rowCount);

          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
      });
    });
  });
});

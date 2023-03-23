import React from "react";
import { render, screen } from "__support__/ui";

import type { Dataset } from "metabase-types/api";
import { createMockDataset } from "metabase-types/api/mocks";

import { HARD_ROW_LIMIT } from "metabase-lib/queries/utils";
import type Question from "metabase-lib/Question";
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
};

function setup({
  result = createMockDataset(),
  isResultDirty = false,
  ...props
}: SetupOpts) {
  const onQueryChange = jest.fn();

  render(
    <QuestionRowCount
      {...props}
      result={result}
      isResultDirty={isResultDirty}
      onQueryChange={onQueryChange}
    />,
  );

  const rowCount = screen.getByLabelText("Row count");

  return { rowCount };
}

describe("QuestionRowCount", () => {
  describe("structured query", () => {
    [
      { question: getAdHocQuestion(), type: "ad-hoc" },
      { question: getSavedStructuredQuestion(), type: "saved" },
    ].forEach(({ question, type }) => {
      describe(type, () => {
        it("shows real row count when limit isn't set", () => {
          const { rowCount } = setup({
            question,
            result: createMockDataset({ row_count: 80 }),
          });
          expect(rowCount).toHaveTextContent("Showing 80 rows");
        });

        it("shows real row count when results are not dirty", () => {
          const query = question.query() as StructuredQuery;
          const { rowCount } = setup({
            question: query.updateLimit(25).question(),
            result: createMockDataset({ row_count: 80 }),
            isResultDirty: false,
          });

          expect(rowCount).toHaveTextContent("Showing 80 rows");
        });

        it("shows applied limit if results are dirty", () => {
          const query = question.query() as StructuredQuery;
          const { rowCount } = setup({
            question: query.updateLimit(25).question(),
            result: createMockDataset(),
            isResultDirty: true,
          });

          expect(rowCount).toHaveTextContent("Show 25 rows");
        });

        it("shows real row count when limit is above the hard limit", () => {
          const query = question.query() as StructuredQuery;
          const { rowCount } = setup({
            question: query.updateLimit(HARD_ROW_LIMIT + 1).question(),
            result: createMockDataset({ row_count: 321 }),
          });

          expect(rowCount).toHaveTextContent("Showing 321 rows");
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
        it("doesn't show anything when results are dirty", () => {
          const { rowCount } = setup({ question, isResultDirty: true });
          expect(rowCount).toBeEmptyDOMElement();
        });

        it("shows the real row count", () => {
          const result = createMockDataset({ row_count: 744 });
          const { rowCount } = setup({ question, result });

          expect(rowCount).toHaveTextContent("Showing 744 rows");
        });

        it("shows the hard limit", () => {
          const result = createMockDataset({ row_count: HARD_ROW_LIMIT });
          const { rowCount } = setup({ question, result });

          expect(rowCount).toHaveTextContent(
            `Showing first ${HARD_ROW_LIMIT} rows`,
          );
        });

        it("shows the real row count when limit isn't applied by the query itself", () => {
          const result = createMockDataset({
            row_count: 70,
            data: { rows_truncated: 1000 },
          });
          const { rowCount } = setup({ question, result });

          expect(rowCount).toHaveTextContent("Showing first 70 rows");
        });
      });
    });
  });
});

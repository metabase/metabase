import React from "react";
import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen, waitFor } from "__support__/ui";

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

  function getNextQuery() {
    const [lastCall] = onQueryChange.mock.calls.reverse();
    const [nextQuery] = lastCall;
    return nextQuery;
  }

  return { rowCount, getNextQuery };
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

        it("allows setting a limit", async () => {
          const { rowCount, getNextQuery } = setup({ question });

          userEvent.click(rowCount);
          const input = await screen.findByPlaceholderText("Pick a limit");
          fireEvent.change(input, { target: { value: "25" } });
          fireEvent.keyPress(input, { key: "Enter", charCode: 13 });

          await waitFor(() => {
            expect(getNextQuery().limit()).toBe(25);
          });
        });

        it("allows updating a limit", async () => {
          const query = question.query() as StructuredQuery;
          const { rowCount, getNextQuery } = setup({
            question: query.updateLimit(25).question(),
          });

          userEvent.click(rowCount);
          const input = await screen.findByDisplayValue("25");
          fireEvent.change(input, { target: { value: "400" } });
          fireEvent.keyPress(input, { key: "Enter", charCode: 13 });

          await waitFor(() => {
            expect(getNextQuery().limit()).toBe(400);
          });
        });

        it("allows resetting a limit", async () => {
          const query = question.query() as StructuredQuery;
          const { rowCount, getNextQuery } = setup({
            question: query.updateLimit(25).question(),
          });

          userEvent.click(rowCount);
          userEvent.click(
            await screen.findByRole("radio", { name: /Show maximum/i }),
          );

          await waitFor(() => {
            expect(getNextQuery().limit()).toBeUndefined();
          });
        });

        it("doesn't allow managing limit if query is read-only", () => {
          question.query().isEditable = () => false;
          const { rowCount } = setup({ question });

          expect(
            screen.queryByRole("button", { name: "Row count" }),
          ).not.toBeInTheDocument();

          userEvent.click(rowCount);

          expect(screen.queryByTestId("limit-popover")).not.toBeInTheDocument();
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

        it("doesn't allow managing limit", () => {
          question.query().isEditable = () => false;
          const { rowCount } = setup({ question });

          expect(
            screen.queryByRole("button", { name: "Row count" }),
          ).not.toBeInTheDocument();

          userEvent.click(rowCount);

          expect(screen.queryByTestId("limit-popover")).not.toBeInTheDocument();
        });
      });
    });
  });
});

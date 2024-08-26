import { renderWithProviders, screen, within } from "__support__/ui";
import {
  SAMPLE_METADATA,
  createQueryWithClauses,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { CardType } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { Notebook } from "./Notebook";

type SetupOpts = {
  question: Question;
  reportTimezone?: string;
  readOnly?: boolean;
  isRunnable?: boolean;
  isDirty?: boolean;
  isResultDirty?: boolean;
  hasVisualizeButton?: boolean;
};

function setup({
  question,
  reportTimezone = "UTC",
  readOnly = false,
  isRunnable = false,
  isDirty = false,
  isResultDirty = false,
  hasVisualizeButton = false,
}: SetupOpts) {
  const updateQuestion = jest.fn();
  const runQuestionQuery = jest.fn();
  const setQueryBuilderMode = jest.fn();

  renderWithProviders(
    <Notebook
      question={question}
      reportTimezone={reportTimezone}
      readOnly={readOnly}
      isRunnable={isRunnable}
      isDirty={isDirty}
      isResultDirty={isResultDirty}
      hasVisualizeButton={hasVisualizeButton}
      updateQuestion={updateQuestion}
      runQuestionQuery={runQuestionQuery}
      setQueryBuilderMode={setQueryBuilderMode}
    />,
  );

  return { updateQuestion, runQuestionQuery, setQueryBuilderMode };
}

function createSummarizedQuestion(type: CardType) {
  const query = createQueryWithClauses({
    aggregations: [{ operatorName: "count" }],
  });
  return new Question(createMockCard({ type }), SAMPLE_METADATA).setQuery(
    query,
  );
}

describe("Notebook", () => {
  it.each<CardType>(["question", "model"])(
    "should have regular copy for the summarize step for %s queries",
    type => {
      setup({
        question: createSummarizedQuestion(type),
      });

      const step = screen.getByTestId("step-summarize-0-0");
      expect(within(step).getByText("Summarize")).toBeInTheDocument();
      expect(within(step).getByText("by")).toBeInTheDocument();
      expect(within(step).getByLabelText("Remove step")).toBeInTheDocument();
      expect(within(step).queryByText("Formula")).not.toBeInTheDocument();
      expect(
        within(step).queryByText("Default time dimension"),
      ).not.toBeInTheDocument();
    },
  );

  it("should have metric-specific copy for the summarize step", () => {
    setup({
      question: createSummarizedQuestion("metric"),
    });

    const step = screen.getByTestId("step-summarize-0-0");
    expect(within(step).getByText("Formula")).toBeInTheDocument();
    expect(
      within(step).getAllByText("Default time dimension").length,
    ).toBeGreaterThanOrEqual(1);
    expect(within(step).queryByText("Summarize")).not.toBeInTheDocument();
    expect(within(step).queryByText("by")).not.toBeInTheDocument();
    expect(
      within(step).queryByLabelText("Remove step"),
    ).not.toBeInTheDocument();
  });

  it.each<CardType>(["question", "model"])(
    "should be able to remove the summarize step for %s queries",
    type => {
      setup({
        question: createSummarizedQuestion(type),
      });

      const step = screen.getByTestId("step-summarize-0-0");
      expect(within(step).getByLabelText("Remove step")).toBeInTheDocument();
    },
  );

  it("should not be able to remove the summarize step for metrics", () => {
    setup({
      question: createSummarizedQuestion("metric"),
    });

    const step = screen.getByTestId("step-summarize-0-0");
    expect(
      within(step).queryByLabelText("Remove step"),
    ).not.toBeInTheDocument();
  });
});

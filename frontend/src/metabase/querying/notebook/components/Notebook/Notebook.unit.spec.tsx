import { renderWithProviders, screen, within } from "__support__/ui";
import {
  SAMPLE_METADATA,
  createQueryWithClauses,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
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

describe("Notebook", () => {
  it("should use 'Formula' title for the summarize step for metrics", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
    });
    setup({
      question: new Question(
        createMockCard({ type: "metric" }),
        SAMPLE_METADATA,
      ).setQuery(query),
    });
    const step = screen.getByTestId("step-summarize-0-0");
    expect(within(step).getByText("Formula")).toBeInTheDocument();
    expect(
      within(step).getByText("Primary time dimension"),
    ).toBeInTheDocument();
    expect(within(step).queryByText("Summarize")).not.toBeInTheDocument();
  });
});

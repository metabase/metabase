import type { ResizableBoxProps } from "react-resizable";

import { renderWithProviders, screen } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";

import { DatasetNotebook } from "./DatasetNotebook";

type SetupOpts = {
  question: Question;
  reportTimezone?: string;
  isDirty?: boolean;
  isRunnable?: boolean;
  isResultDirty?: boolean;
  isResizing?: boolean;
  resizableBoxProps?: ResizableBoxProps;
};

function setup({
  question,
  reportTimezone = "UTC",
  isDirty = false,
  isRunnable = false,
  isResultDirty = false,
  isResizing = false,
  resizableBoxProps = {
    axis: "y",
    height: 100,
  },
}: SetupOpts) {
  const updateQuestion = jest.fn();
  const setQueryBuilderMode = jest.fn();
  const onResizeStop = jest.fn();

  renderWithProviders(
    <DatasetNotebook
      question={question}
      reportTimezone={reportTimezone}
      isDirty={isDirty}
      isRunnable={isRunnable}
      isResultDirty={isResultDirty}
      isResizing={isResizing}
      resizableBoxProps={resizableBoxProps}
      updateQuestion={updateQuestion}
      setQueryBuilderMode={setQueryBuilderMode}
      onResizeStop={onResizeStop}
    />,
  );
}

describe("DatasetNotebook", () => {
  it("should render a metric docs link for metrics", () => {
    const question = new Question(createMockCard({ type: "metric" }));
    setup({ question });
    const link = screen.getByRole("link", { name: /Docs/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("data-modeling/segments-and-metrics"),
    );
  });

  it("should not render a metric docs link for non-metrics", () => {
    const question = new Question(createMockCard({ type: "question" }));
    setup({ question });
    expect(
      screen.queryByRole("link", { name: /Docs/ }),
    ).not.toBeInTheDocument();
  });
});

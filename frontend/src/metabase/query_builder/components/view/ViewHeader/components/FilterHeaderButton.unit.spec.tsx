import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA, createQuery } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";

import { FilterHeaderButton } from "./FilterHeaderButton";

const QUESTION_WITH_FILTERS = Question.create({
  metadata: SAMPLE_METADATA,
}).setQuery(Lib.filter(createQuery(), 0, Lib.expressionClause(">", [1, 2])));

const QUESTION_WITHOUT_FILTERS = Question.create({
  metadata: SAMPLE_METADATA,
}).setQuery(createQuery());

type SetupOpts = {
  question?: Question;
  isExpanded?: boolean;
};

function setup({
  question = QUESTION_WITHOUT_FILTERS,
  isExpanded = false,
}: SetupOpts) {
  const onExpand = jest.fn();
  const onCollapse = jest.fn();

  renderWithProviders(
    <FilterHeaderButton
      question={question}
      isExpanded={isExpanded}
      onExpand={onExpand}
      onCollapse={onCollapse}
    />,
  );

  return { onExpand, onCollapse };
}

describe("FilterHeaderButton", () => {
  it("should render filter button", () => {
    setup({ question: QUESTION_WITHOUT_FILTERS });
    expect(screen.getByText("Filter")).toBeInTheDocument();
    expect(screen.getByTestId("question-filter-header")).toBeInTheDocument();
  });

  it("should render filter count when a query has filters", () => {
    setup({ question: QUESTION_WITH_FILTERS });
    expect(screen.getByTestId("filters-visibility-control")).toHaveTextContent(
      "1",
    );
  });

  it("should not render filter count when a query has 0 filters", () => {
    setup({ question: QUESTION_WITHOUT_FILTERS });
    expect(
      screen.queryByTestId("filters-visibility-control"),
    ).not.toBeInTheDocument();
  });

  it("should populate true data-expanded property", () => {
    setup({ question: QUESTION_WITH_FILTERS, isExpanded: true });
    expect(screen.getByTestId("filters-visibility-control")).toHaveAttribute(
      "data-expanded",
      "true",
    );
  });

  it("should populate false data-expanded property", () => {
    setup({ question: QUESTION_WITH_FILTERS, isExpanded: false });
    expect(screen.getByTestId("filters-visibility-control")).toHaveAttribute(
      "data-expanded",
      "false",
    );
  });
});

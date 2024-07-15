import { createMockMetadata } from "__support__/metadata";
import {
  renderWithProviders,
  screen,
  waitFor,
  fireEvent,
} from "__support__/ui";
import { getColumnIcon } from "metabase/common/utils/columns";
import type * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";
import type { Suggestion } from "metabase-lib/v1/expressions/suggest";
import { suggest } from "metabase-lib/v1/expressions/suggest";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { ExpressionEditorSuggestions } from "./ExpressionEditorSuggestions";

const METADATA = createMockMetadata({
  databases: [createSampleDatabase()],
});

type WrapperProps = {
  query: Lib.Query;
  stageIndex: number;
  suggestions?: Suggestion[];
  highlightedIndex: number;
  onSuggestionMouseDown: () => void;
  onHighlightSuggestion: (index: number) => void;
  startRule: string;
};

function Wrapper(props: WrapperProps) {
  return (
    <ExpressionEditorSuggestions {...props} open>
      <div>target</div>
    </ExpressionEditorSuggestions>
  );
}

type SetupOpts = {
  source?: string;
  startRule: string;
  expressionIndex?: number;
};

function setup({ source = "", startRule, expressionIndex }: SetupOpts) {
  const query = createQuery({ metadata: METADATA });
  const stageIndex = 0;
  const { suggestions } = suggest({
    source,
    query,
    stageIndex,
    metadata: METADATA,
    startRule: "expression",
    getColumnIcon,
    expressionIndex,
  });

  const onHighlightSuggestion = jest.fn();

  const props = {
    query,
    stageIndex,
    suggestions,
    onSuggestionMouseDown: jest.fn(),
    onHighlightSuggestion,
    highlightedIndex: -1,
    startRule,
  };

  const { rerender } = renderWithProviders(<Wrapper {...props} />);

  // force rerender to make sure the target prop has a value
  rerender(<Wrapper {...props} />);

  return {
    onHighlightSuggestion,
  };
}

describe("ExpressionEditorSuggestions", () => {
  it("should render with the column info icon", async () => {
    setup({ source: "[", startRule: "expression" });

    await waitFor(() =>
      screen.findAllByTestId("expression-suggestions-list-item"),
    );

    expect(screen.getAllByLabelText("More info").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  test("suggestions items should show function helptext info icons", async () => {
    setup({ source: "con", startRule: "expression" });

    await waitFor(() =>
      screen.findAllByTestId("expression-suggestions-list-item"),
    );

    expect(screen.getAllByLabelText("More info").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("should show functions when first opened", () => {
    setup({ startRule: "expression" });
    expect(screen.getByText("Common functions")).toBeInTheDocument();

    expect(screen.getByText("case")).toBeInTheDocument();
    expect(screen.getByText("coalesce")).toBeInTheDocument();
  });

  it("should not include popular functions when text has been typed", () => {
    setup({ source: "[", startRule: "expression" });
    expect(screen.queryByText("Common functions")).not.toBeInTheDocument();

    expect(screen.queryByText("case")).not.toBeInTheDocument();
    expect(screen.queryByText("coalesce")).not.toBeInTheDocument();
  });

  it("should highlight a suggestion when hovering it", () => {
    const { onHighlightSuggestion } = setup({ startRule: "expression" });
    expect(screen.getByText("Common functions")).toBeInTheDocument();

    fireEvent.mouseMove(screen.getByText("case"));
    expect(onHighlightSuggestion).toHaveBeenCalled();
  });
});

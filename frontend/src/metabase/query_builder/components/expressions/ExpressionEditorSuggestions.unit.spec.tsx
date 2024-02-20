import { useRef } from "react";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen, within } from "__support__/ui";
import { getColumnIcon } from "metabase/common/utils/columns";
import type * as Lib from "metabase-lib";
import type { Suggestion } from "metabase-lib/expressions/suggest";
import { suggest } from "metabase-lib/expressions/suggest";
import { createQuery } from "metabase-lib/test-helpers";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import ExpressionEditorSuggestions from "./ExpressionEditorSuggestions";

const METADATA = createMockMetadata({
  databases: [createSampleDatabase()],
});

type WrapperProps = {
  query: Lib.Query;
  stageIndex: number;
  suggestions?: Suggestion[];
  highlightedIndex: number;
  onSuggestionMouseDown: () => void;
};

function Wrapper(props: WrapperProps) {
  const ref = useRef(null);
  return (
    <div ref={ref}>
      <ExpressionEditorSuggestions {...props} target={ref.current} />
    </div>
  );
}

function setup() {
  const query = createQuery({ metadata: METADATA });
  const stageIndex = 0;
  const { suggestions } = suggest({
    source: "[",
    query,
    stageIndex,
    metadata: METADATA,
    startRule: "expression",
    getColumnIcon,
  });

  const props = {
    query,
    stageIndex,
    suggestions,
    onSuggestionMouseDown: jest.fn(),
    highlightedIndex: -1,
  };

  const { rerender } = renderWithProviders(<Wrapper {...props} />);

  // force rerender to make sure the target prop has a value
  rerender(<Wrapper {...props} />);
}

describe("ExpressionEditorSuggestions", () => {
  test("suggestions items should show column info icon", async () => {
    setup();
    const items = await screen.findAllByTestId(
      "expression-suggestions-list-item",
    );

    items.forEach(item => {
      expect(within(item).getByLabelText("More info")).toBeInTheDocument();
    });
  });
});

import { useRef } from "react";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { getColumnIcon } from "metabase/common/utils/columns";
import type * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";
import type { Suggestion } from "metabase-lib/v1/expressions/suggest";
import { suggest } from "metabase-lib/v1/expressions/suggest";
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

type SetupOpts = {
  source: string;
};

function setup(opts: SetupOpts) {
  const query = createQuery({ metadata: METADATA });
  const stageIndex = 0;
  const { suggestions } = suggest({
    source: opts.source,
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
    setup({ source: "[" });

    await waitFor(() =>
      screen.findAllByTestId("expression-suggestions-list-item"),
    );

    expect(screen.getAllByLabelText("More info").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  test("suggestions items should show function helptext info icons", async () => {
    setup({ source: "con" });

    await waitFor(() =>
      screen.findAllByTestId("expression-suggestions-list-item"),
    );

    expect(screen.getAllByLabelText("More info").length).toBeGreaterThanOrEqual(
      1,
    );
  });
});

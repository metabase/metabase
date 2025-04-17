import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import { createQuery } from "metabase-lib/test-helpers";
import type { NativeQuerySnippet } from "metabase-types/api";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { CodeMirrorEditor } from "./CodeMirrorEditor";

function setup({
  text = "",
  readOnly = false,
  snippets = [],
}: {
  text?: string;
  readOnly?: boolean;
  snippets?: NativeQuerySnippet[];
} = {}) {
  const onChange = jest.fn();
  const onCursorMoveOverCardTag = jest.fn();
  const onRightClickSelection = jest.fn();
  const onSelectionChange = jest.fn();

  fetchMock.get("path:/api/native-query-snippet", {
    body: snippets,
  });

  const database = createSampleDatabase();
  const metadata = createMockMetadata({
    databases: [database],
  });
  const query = createQuery({
    metadata,
    query: {
      database: database.id,
      type: "native",
      native: {
        query: text,
      },
    },
  });

  renderWithProviders(
    <CodeMirrorEditor
      query={query}
      onChange={onChange}
      readOnly={readOnly}
      onCursorMoveOverCardTag={onCursorMoveOverCardTag}
      onRightClickSelection={onRightClickSelection}
      onSelectionChange={onSelectionChange}
    />,
  );

  return {
    onChange,
    onCursorMoveOverCardTag,
    onRightClickSelection,
    onSelectionChange,
  };
}

describe("CodemirrorEditor", () => {
  it("Should render the natie query's text", () => {
    const text = "SELECT 1;";

    setup({ text });
    expect(screen.getByRole("textbox")).toHaveTextContent(text);
  });
});

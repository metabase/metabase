jest.unmock("@uiw/react-codemirror");

import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import { waitForRequestsToSettle } from "__support__/utils";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import type {
  CardAutocompleteSuggestion,
  NativeQuerySnippet,
} from "metabase-types/api";
import { createMockCard, createMockField } from "metabase-types/api/mocks";
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
  const provider = createMetadataProvider({
    databaseId: database.id,
    metadata,
  });

  const query = Lib.createTestNativeQuery(provider, { query: text });

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

  it("reports the card id when the cursor moves into a card tag", async () => {
    const { onCursorMoveOverCardTag } = setup({
      text: "SELECT {{#42-foo}} FROM t",
    });

    await waitForRequestsToSettle();
    await userEvent.click(screen.getByRole("textbox"));
    await userEvent.keyboard("{ArrowRight>3/}");
    expect(onCursorMoveOverCardTag).not.toHaveBeenCalled();

    await userEvent.keyboard("{ArrowRight>8/}");
    expect(onCursorMoveOverCardTag).toHaveBeenLastCalledWith(42);

    await userEvent.keyboard("{ArrowRight>9/}");
    const callsUntilAfterTag = onCursorMoveOverCardTag.mock.calls.length;
    await userEvent.keyboard("{ArrowRight>3/}");
    expect(onCursorMoveOverCardTag).toHaveBeenCalledTimes(callsUntilAfterTag);
  });

  it("completes columns of the cards referenced in the query", async () => {
    fetchMock.get("path:/api/database/1/autocomplete_suggestions", []);
    fetchMock.get(
      "path:/api/card/42",
      createMockCard({
        id: 42,
        name: "Referenced Question",
        result_metadata: [createMockField({ name: "A_UNIQUE_COLUMN_NAME" })],
      }),
    );
    setup({ text: "SELECT * FROM {{#42-referenced-question}}" });

    await waitForRequestsToSettle();
    await userEvent.click(screen.getByRole("textbox"));
    await userEvent.keyboard("{Control>}{End}{/Control} a_uni");

    expect(
      await screen.findByRole("listbox", { name: "Completions" }),
    ).toHaveTextContent("A_UNIQUE_COLUMN_NAME");
  });

  it("completes card names inside a card tag", async () => {
    const suggestion: CardAutocompleteSuggestion = {
      id: 51,
      name: "A People Question",
      type: "question",
      collection_name: null,
    };
    fetchMock.get("path:/api/database/1/card_autocomplete_suggestions", [
      suggestion,
    ]);
    setup({ text: "SELECT * FROM " });

    await waitForRequestsToSettle();
    await userEvent.click(screen.getByRole("textbox"));
    await userEvent.keyboard("{Control>}{End}{/Control}{{{{#peo");

    expect(
      await screen.findByRole("listbox", { name: "Completions" }),
    ).toHaveTextContent("#51-a-people-question");
  });
});

jest.unmock("@uiw/react-codemirror");

import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { NativeQueryEditor } from "./NativeQueryEditor";

function setup({ text }: { text: string }) {
  setupNativeQuerySnippetEndpoints();
  setupCollectionsEndpoints({ collections: [] });
  const database = createSampleDatabase();
  setupDatabasesEndpoints([database]);
  const metadata = createMockMetadata({ databases: [database] });
  const provider = createMetadataProvider({
    databaseId: database.id,
    metadata,
  });
  const initialQuestion = Question.create({ metadata }).setQuery(
    Lib.createTestNativeQuery(provider, { query: text }),
  );
  const setDatasetQuery = jest.fn<void, [NativeQuery]>();

  function Editor() {
    const [question, setQuestion] = useState(initialQuestion);
    return (
      <NativeQueryEditor
        question={question}
        query={checkNotNull(question.legacyNativeQuery())}
        isNativeEditorOpen
        setDatasetQuery={(query) => {
          setDatasetQuery(query);
          setQuestion(question.setDatasetQuery(query.datasetQuery()));
        }}
      >
        <NativeQueryEditor.TopBar>
          <NativeQueryEditor.Sidebar />
        </NativeQueryEditor.TopBar>
      </NativeQueryEditor>
    );
  }

  renderWithProviders(<Editor />);

  return { setDatasetQuery };
}

describe("native query formatting", () => {
  it("formats the query with Shift+Ctrl+F", async () => {
    const { setDatasetQuery } = setup({ text: "SELECT COUNT(*) FROM ORDERS" });

    await userEvent.click(screen.getByRole("textbox"));
    await userEvent.keyboard("{Shift>}{Control>}f{/Control}{/Shift}");

    await waitFor(() => expect(setDatasetQuery).toHaveBeenCalledTimes(1));
    expect(checkNotNull(setDatasetQuery.mock.calls[0]?.[0]).queryText()).toBe(
      "SELECT\n  COUNT(*)\nFROM\n  ORDERS",
    );
  });
});

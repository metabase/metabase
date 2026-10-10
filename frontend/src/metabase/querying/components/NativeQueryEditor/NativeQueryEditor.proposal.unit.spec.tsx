jest.unmock("@uiw/react-codemirror");

import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { getDiffControls } from "metabase/querying/components/CodeMirrorEditor/test-utils";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { NativeQueryEditor } from "./NativeQueryEditor";
import { formatQuery } from "./utils";

function setup({ text = "SELECT 1", proposedText = "SELECT 2" } = {}) {
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
  const proposedQuestion = initialQuestion.setQuery(
    Lib.withNativeQuery(initialQuestion.query(), proposedText),
  );
  const setDatasetQuery = jest.fn<void, [NativeQuery]>();
  const onAcceptProposed = jest.fn();
  const onRejectProposed = jest.fn();

  function Editor() {
    const [question, setQuestion] = useState(initialQuestion);
    return (
      <NativeQueryEditor
        question={question}
        query={checkNotNull(question.legacyNativeQuery())}
        proposedQuestion={proposedQuestion}
        isNativeEditorOpen
        setDatasetQuery={(query) => {
          setDatasetQuery(query);
          setQuestion(question.setDatasetQuery(query.datasetQuery()));
        }}
        onAcceptProposed={onAcceptProposed}
        onRejectProposed={onRejectProposed}
      >
        <NativeQueryEditor.TopBar>
          <NativeQueryEditor.Sidebar />
        </NativeQueryEditor.TopBar>
      </NativeQueryEditor>
    );
  }

  renderWithProviders(<Editor />);

  return {
    setDatasetQuery,
    onAcceptProposed,
    onRejectProposed,
    proposedQuestion,
  };
}

describe("native query proposals", () => {
  it("keeps the review buttons under the changed clause after auto-format", async () => {
    const text =
      "select id, total from orders where id = 1 order by id limit 10";
    const formatted = await formatQuery(text, "h2");
    setup({ text, proposedText: formatted.replace("id = 1", "id = 2") });
    expect(screen.getByRole("button", { name: /Accept/ })).toBeInTheDocument();

    await userEvent.click(await screen.findByLabelText("Auto-format"));

    await waitFor(() =>
      expect(
        getDiffControls(screen.getByRole("textbox")).previousLine,
      ).toHaveTextContent("id = 2"),
    );
    const { row, previousLine, nextLine } = getDiffControls(
      screen.getByRole("textbox"),
    );
    expect(
      within(row).getByRole("button", { name: /Accept/ }),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: /Reject/ }),
    ).toBeInTheDocument();
    expect(previousLine).toHaveTextContent("id = 2");
    expect(nextLine).toHaveTextContent("ORDER BY");
  });

  it("applies the proposed SQL before accepting it", async () => {
    const { setDatasetQuery, onAcceptProposed, proposedQuestion } = setup();

    await userEvent.click(screen.getByRole("button", { name: /Accept/ }));

    expect(setDatasetQuery).toHaveBeenCalledTimes(1);
    expect(checkNotNull(setDatasetQuery.mock.calls[0]?.[0]).queryText()).toBe(
      "SELECT 2",
    );
    expect(onAcceptProposed).toHaveBeenCalledWith(
      proposedQuestion.datasetQuery(),
    );
    expect(setDatasetQuery.mock.invocationCallOrder[0]).toBeLessThan(
      onAcceptProposed.mock.invocationCallOrder[0],
    );
  });

  it("rejects the proposed SQL", async () => {
    const { onRejectProposed } = setup();

    await userEvent.click(screen.getByRole("button", { name: /Reject/ }));

    expect(onRejectProposed).toHaveBeenCalledTimes(1);
  });
});

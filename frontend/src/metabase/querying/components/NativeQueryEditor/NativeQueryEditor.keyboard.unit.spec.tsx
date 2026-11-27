jest.unmock("@uiw/react-codemirror");

import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCollectionsEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { waitForRequestsToSettle } from "__support__/utils";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { NativeQueryEditor } from "./NativeQueryEditor";

const METADATA = createMockMetadata({ databases: [createSampleDatabase()] });

const QUESTION = Question.create({ metadata: METADATA }).setQuery(
  Lib.createTestNativeQuery(
    createMetadataProvider({ databaseId: SAMPLE_DB_ID, metadata: METADATA }),
    { query: "SELECT 1" },
  ),
);

async function setup({ isRunning }: { isRunning: boolean }) {
  const runQuery = jest.fn();
  const cancelQuery = jest.fn();

  setupCollectionsEndpoints({ collections: [] });
  setupNativeQuerySnippetEndpoints();

  renderWithProviders(
    <NativeQueryEditor
      question={QUESTION}
      isNativeEditorOpen
      setQuery={jest.fn()}
      isRunnable
      isRunning={isRunning}
      runQuery={runQuery}
      cancelQuery={cancelQuery}
    />,
  );

  await waitForRequestsToSettle();
  await userEvent.click(screen.getByRole("textbox"));
  await userEvent.keyboard("{Control>}{Enter}{/Control}");

  return { runQuery, cancelQuery };
}

describe("NativeQueryEditor > Ctrl+Enter", () => {
  it("runs query when no query is running", async () => {
    const { runQuery, cancelQuery } = await setup({ isRunning: false });

    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(cancelQuery).not.toHaveBeenCalled();
  });

  it("cancels query while query is running", async () => {
    const { runQuery, cancelQuery } = await setup({ isRunning: true });

    expect(cancelQuery).toHaveBeenCalledTimes(1);
    expect(runQuery).not.toHaveBeenCalled();
  });
});

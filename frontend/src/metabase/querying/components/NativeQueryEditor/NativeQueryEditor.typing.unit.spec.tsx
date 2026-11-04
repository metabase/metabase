import userEvent from "@testing-library/user-event";
import { useCallback, useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCollectionsEndpoints,
  setupNativeQuerySnippetEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import {
  createMockCard,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
} from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { NativeQueryEditor } from "./NativeQueryEditor";

/**
 * `@uiw/react-codemirror` reconfigures the whole editor whenever one of these
 * props changes identity, which rebuilds the language parser and every view
 * plugin, and re-decorates the whole document. Doing that once per keystroke is
 * what made typing slow with large queries (DEV-3545).
 */
const RECONFIGURING_PROPS = [
  "extensions",
  "onChange",
  "onFormat",
  "onUpdate",
] as const;

type ReconfiguringProp = (typeof RECONFIGURING_PROPS)[number];

const receivedProps: Record<ReconfiguringProp, unknown>[] = [];

jest.mock("metabase/common/components/CodeMirror", () => {
  const { forwardRef } = jest.requireActual("react");

  return {
    __esModule: true,
    ...jest.requireActual("metabase/common/components/CodeMirror"),
    // Unjustified type casts. The mock stands in for a component with a large
    // prop surface that this spec does not need to model.
    CodeMirror: forwardRef(function MockCodeMirror(props: any, _ref: unknown) {
      receivedProps.push({
        extensions: props.extensions,
        onChange: props.onChange,
        onFormat: props.onFormat,
        onUpdate: props.onUpdate,
      });

      return (
        <textarea
          data-testid="mock-code-mirror"
          value={props.value}
          onChange={(event) => props.onChange?.(event.target.value)}
        />
      );
    }),
  };
});

const QUERY_TEXT = "SELECT 1";

const setDatasetQuerySpy = jest.fn();
const runQuerySpy = jest.fn();

function TestEditor({
  metadata,
  withRunButton = false,
}: {
  metadata: Metadata;
  withRunButton?: boolean;
}) {
  const [card, setCard] = useState(() =>
    createMockCard({
      id: 1,
      name: "Native",
      dataset_query: createMockNativeDatasetQuery({
        database: SAMPLE_DB_ID,
        native: createMockNativeQuery({ query: QUERY_TEXT }),
      }),
    }),
  );

  const question = new Question(card, metadata);
  // Unjustified type cast. The question is built from a native dataset query.
  const query = question.legacyNativeQuery() as NativeQuery;

  // The query builder passes a dispatch-bound action, whose identity is stable
  const setDatasetQuery = useCallback((updatedQuery: NativeQuery) => {
    setDatasetQuerySpy(updatedQuery.queryText());
    setCard((previousCard) => ({
      ...previousCard,
      dataset_query: updatedQuery.datasetQuery(),
    }));
  }, []);

  return (
    <NativeQueryEditor
      question={question}
      query={query}
      isNativeEditorOpen
      setDatasetQuery={setDatasetQuery}
      isRunnable
      runQuery={runQuerySpy}
      cancelQuery={jest.fn()}
    >
      {withRunButton && <NativeQueryEditor.RunButton />}
    </NativeQueryEditor>
  );
}

async function setup({ withRunButton = false } = {}) {
  setupNativeQuerySnippetEndpoints();
  setupCollectionsEndpoints({ collections: [] });
  setupUserMetabotPermissionsEndpoint();

  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  const { unmount } = renderWithProviders(
    <TestEditor metadata={metadata} withRunButton={withRunButton} />,
  );

  const editor = await screen.findByTestId("mock-code-mirror");

  return { editor, unmount };
}

async function typeThreeCharacters() {
  const { editor } = await setup();

  receivedProps.length = 0;
  await userEvent.type(editor, "234");

  return receivedProps;
}

describe("NativeQueryEditor typing", () => {
  beforeEach(() => {
    receivedProps.length = 0;
    setDatasetQuerySpy.mockClear();
    runQuerySpy.mockClear();
  });

  it.each(RECONFIGURING_PROPS)(
    "should keep the %s prop stable while typing",
    async (prop) => {
      const renders = await typeThreeCharacters();

      expect(renders.length).toBeGreaterThan(1);
      expect(new Set(renders.map((render) => render[prop])).size).toBe(1);
    },
  );
});

describe("NativeQueryEditor deferred edits", () => {
  beforeEach(() => {
    receivedProps.length = 0;
    setDatasetQuerySpy.mockClear();
    runQuerySpy.mockClear();
  });

  it("should not put the edit in the store during the keystroke", async () => {
    const { editor } = await setup();

    fireEvent.change(editor, { target: { value: "SELECT 2" } });

    expect(setDatasetQuerySpy).not.toHaveBeenCalled();
  });

  it("should put the edit in the store once the keystroke is over", async () => {
    const { editor } = await setup();

    fireEvent.change(editor, { target: { value: "SELECT 2" } });

    await waitFor(() => {
      expect(setDatasetQuerySpy).toHaveBeenCalledWith("SELECT 2");
    });
  });

  it("should only apply the last of several edits made in one task", async () => {
    const { editor } = await setup();

    fireEvent.change(editor, { target: { value: "SELECT 2" } });
    fireEvent.change(editor, { target: { value: "SELECT 23" } });
    fireEvent.change(editor, { target: { value: "SELECT 234" } });

    await waitFor(() => {
      expect(setDatasetQuerySpy).toHaveBeenCalledWith("SELECT 234");
    });
    expect(setDatasetQuerySpy).toHaveBeenCalledTimes(1);
  });

  it("should not lose a pending edit when the editor unmounts", async () => {
    const { editor, unmount } = await setup();

    fireEvent.change(editor, { target: { value: "SELECT 2" } });
    unmount();

    expect(setDatasetQuerySpy).toHaveBeenCalledWith("SELECT 2");
  });

  it("should apply a pending edit before running the query", async () => {
    const { editor } = await setup({ withRunButton: true });

    fireEvent.change(editor, { target: { value: "SELECT 2" } });
    await userEvent.click(screen.getByTestId("run-button"));

    expect(setDatasetQuerySpy).toHaveBeenCalledWith("SELECT 2");
    expect(runQuerySpy).toHaveBeenCalled();
    expect(setDatasetQuerySpy.mock.invocationCallOrder[0]).toBeLessThan(
      runQuerySpy.mock.invocationCallOrder[0],
    );
  });
});

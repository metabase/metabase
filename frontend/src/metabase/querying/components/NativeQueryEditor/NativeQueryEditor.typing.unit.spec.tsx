import userEvent from "@testing-library/user-event";
import { useCallback, useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCollectionsEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { createMockCard } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

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

const setQuerySpy = jest.fn();
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
      dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
        query: QUERY_TEXT,
      }),
      query_type: "native",
    }),
  );

  const question = new Question(card, metadata);
  const setQuery = useCallback((updatedQuery: Lib.Query) => {
    setQuerySpy(Lib.rawNativeQuery(updatedQuery));
    setCard((previousCard) => ({
      ...previousCard,
      dataset_query: Lib.toJsQuery(updatedQuery),
    }));
  }, []);

  return (
    <NativeQueryEditor
      question={question}
      isNativeEditorOpen
      setQuery={setQuery}
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
    setQuerySpy.mockClear();
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
    setQuerySpy.mockClear();
    runQuerySpy.mockClear();
  });

  it("should not put the edit in the store during the keystroke", async () => {
    const { editor } = await setup();

    fireEvent.change(editor, { target: { value: "SELECT 2" } });

    expect(setQuerySpy).not.toHaveBeenCalled();
  });

  it("should put the edit in the store once the keystroke is over", async () => {
    const { editor } = await setup();

    fireEvent.change(editor, { target: { value: "SELECT 2" } });

    await waitFor(() => {
      expect(setQuerySpy).toHaveBeenCalledWith("SELECT 2");
    });
  });

  it("should only apply the last of several edits made in one task", async () => {
    const { editor } = await setup();

    fireEvent.change(editor, { target: { value: "SELECT 2" } });
    fireEvent.change(editor, { target: { value: "SELECT 23" } });
    fireEvent.change(editor, { target: { value: "SELECT 234" } });

    await waitFor(() => {
      expect(setQuerySpy).toHaveBeenCalledWith("SELECT 234");
    });
    expect(setQuerySpy).toHaveBeenCalledTimes(1);
  });

  it("should not lose a pending edit when the editor unmounts", async () => {
    const { editor, unmount } = await setup();

    fireEvent.change(editor, { target: { value: "SELECT 2" } });
    unmount();

    expect(setQuerySpy).toHaveBeenCalledWith("SELECT 2");
  });

  it("should apply a pending edit before running the query", async () => {
    const { editor } = await setup({ withRunButton: true });

    fireEvent.change(editor, { target: { value: "SELECT 2" } });
    await userEvent.click(screen.getByTestId("run-button"));

    expect(setQuerySpy).toHaveBeenCalledWith("SELECT 2");
    expect(runQuerySpy).toHaveBeenCalled();
    expect(setQuerySpy.mock.invocationCallOrder[0]).toBeLessThan(
      runQuerySpy.mock.invocationCallOrder[0],
    );
  });
});

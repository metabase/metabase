import userEvent from "@testing-library/user-event";
import { useCallback, useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCollectionsEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
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

function TestEditor({ metadata }: { metadata: Metadata }) {
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
    />
  );
}

async function typeThreeCharacters() {
  setupNativeQuerySnippetEndpoints();
  setupCollectionsEndpoints({ collections: [] });

  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  renderWithProviders(<TestEditor metadata={metadata} />);

  const editor = await screen.findByTestId("mock-code-mirror");

  receivedProps.length = 0;
  await userEvent.type(editor, "234");

  return receivedProps;
}

describe("NativeQueryEditor typing", () => {
  beforeEach(() => {
    receivedProps.length = 0;
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

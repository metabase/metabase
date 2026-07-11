import fetchMock from "fetch-mock";

import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

const TEST_DB = createSampleDatabase();
const ROOT_COLLECTION = createMockCollection({ id: "root" });

// A native query with far more lines than can fit in the available height.
// If `availableHeight` reaches the native editor, the initial editor height is
// capped at ~40% of the available height. If it does NOT (the #69722 bug),
// the editor auto-sizes to the query's full line count and overflows.
const QUERY_LINE_COUNT = 40;
const LONG_QUERY = Array.from(
  { length: QUERY_LINE_COUNT },
  (_, i) => `select ${i}`,
).join("\n");

const longQueryCard = createMockCard({
  dataset_query: createMockNativeDatasetQuery({
    type: "native",
    database: TEST_DB.id,
    native: { query: LONG_QUERY, "template-tags": undefined },
  }),
});

const noop = () => {};
const defaultDatasetEditorProps = {
  datasetEditorTab: "query",
  rawSeries: null,
  visualizationSettings: {},
  isDirty: false,
  isMetadataDirty: false,
  isRunning: true,
  isShowingDataReference: false,
  isShowingSnippetSidebar: false,
  isShowingTemplateTagsEditor: false,
  parameterValues: {},
  params: { slug: "query" },
  updateQuestion: noop,
  handleResize: noop,
  onCancelCreateNewModel: noop,
  cancelQuestionChanges: noop,
  onOpenModal: noop,
  onSave: noop,
  runQuestionQuery: noop,
  setMetadataDiff: noop,
  setQueryBuilderMode: noop,
  toggleDataReference: noop,
  toggleSnippetSidebar: noop,
  toggleTemplateTagsEditor: noop,
  runDirtyQuestionQuery: noop,
  dataReferenceStack: [],
  pushDataReferenceStack: noop,
  popDataReferenceStack: noop,
  setModalSnippet: noop,
  openSnippetModalWithSelectedText: noop,
  insertSnippet: noop,
  snippetCollectionId: null,
};

// The height (in px) of the container that holds the model native editor.
const AVAILABLE_HEIGHT = 600;

const renderDatasetEditor = async (card: Card) => {
  setupUserMetabotPermissionsEndpoint();
  setupDatabasesEndpoints([TEST_DB]);
  setupCollectionsEndpoints({ collections: [ROOT_COLLECTION] });
  setupNativeQuerySnippetEndpoints();
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  fetchMock.get("path:/api/search", { body: { data: [] } });
  fetchMock.get("path:/api/model-index", { body: [] });

  const { DatasetEditor } = await import(
    "metabase/query_builder/components/DatasetEditor"
  );
  const question = new Question(card);

  renderWithProviders(
    <DatasetEditor
      {...defaultDatasetEditorProps}
      question={question}
      height={AVAILABLE_HEIGHT}
    />,
  );

  await screen.findByTestId("native-query-editor-container");
};

// The resizable editor area's height is emitted as an inline style of the form
// `calc(<rem>rem * var(--mantine-scale))`. Extract the rem value.
const getEditorHeightRem = (): number => {
  const el = document.querySelector<HTMLElement>(".react-resizable");
  if (!el) {
    throw new Error("resizable editor area not found");
  }
  const match = el.style.height.match(/([\d.]+)rem/);
  if (!match) {
    throw new Error(`unexpected editor height style: "${el.style.height}"`);
  }
  return Number(match[1]);
};

describe("DatasetEditor native editor availableHeight (metabase#69722)", () => {
  beforeEach(() => {
    jest.unmock("metabase/querying/components/NativeQueryEditor");
  });

  it("caps the model native editor height to the available height", async () => {
    await renderDatasetEditor(longQueryCard);

    // 1rem = 16px. 40 query lines auto-size to getEditorLineHeight(40) = 41rem.
    // With availableHeight=600 the editor is capped well below that (16rem).
    // The bug lets it grow to the full 41rem and overflow the run button.
    const UNCAPPED_HEIGHT_REM = 41;

    expect(getEditorHeightRem()).toBeLessThan(UNCAPPED_HEIGHT_REM);
  });
});

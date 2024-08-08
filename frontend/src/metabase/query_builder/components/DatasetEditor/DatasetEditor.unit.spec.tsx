import fetchMock from "fetch-mock";

import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import DatasetEditor from "metabase/query_builder/components/DatasetEditor";
import Question from "metabase-lib/v1/Question";
import type { Card, UnsavedCard } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockNativeDatasetQuery,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

const TEST_DB = createSampleDatabase();
const ROOT_COLLECTION = createMockCollection({ id: "root" });

const mockSavedCard = createMockCard({
  dataset_query: createMockNativeDatasetQuery({
    type: "native",
    database: TEST_DB.id,
    native: {
      query: "select * from orders",
      "template-tags": undefined,
    },
  }),
});
const mockUnsavedCard = createMockUnsavedCard();

const noop = () => null;
const defaultDatasetEditorProps = {
  datasetEditorTab: "query",
  isDirty: false,
  isMetadataDirty: false,
  isRunning: true,
  isShowingDataReference: false,
  isShowingSnippetSidebar: false,
  isShowingTemplateTagsEditor: false,
  parameterValues: {},
  params: { slug: "query" },
  handleResize: noop,
  onCancelCreateNewModel: noop,
  onCancelDatasetChanges: noop,
  onOpenModal: noop,
  onSave: noop,
  runQuestionQuery: noop,
  setMetadataDiff: noop,
  setQueryBuilderMode: noop,
  toggleDataReference: noop,
  toggleSnippetSidebar: noop,
  toggleTemplateTagsEditor: noop,
};

const renderDatasetEditor = (card: Card | UnsavedCard) => {
  setupDatabasesEndpoints([TEST_DB]);
  setupCollectionsEndpoints({ collections: [ROOT_COLLECTION] });
  setupNativeQuerySnippetEndpoints();
  const question = new Question(card);

  renderWithProviders(
    <DatasetEditor
      {...defaultDatasetEditorProps}
      question={question}
      query={question.legacyQuery({ useStructuredQuery: true })}
    />,
  );
};

describe("DatasetEditor", () => {
  beforeEach(() => {
    fetchMock.get("path:/api/search", () => ({ body: { data: [] } }));
    fetchMock.get("path:/api/model-index", () => ({ body: { data: [] } }));
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it("tries to load a model index when card is already saved", () => {
    renderDatasetEditor(mockSavedCard);
    const calls = fetchMock.calls("path:/api/model-index");
    expect(calls).toHaveLength(1);
    expect(
      new URL(calls[0]?.request?.url ?? "").searchParams.get("model_id"),
    ).toBe(`${mockSavedCard.id}`);
  });
  it("does not try to load a model index when card is unsaved", () => {
    renderDatasetEditor(mockUnsavedCard);
    const calls = fetchMock.calls("path:/api/model-index");
    expect(calls).toHaveLength(0);
  });
});

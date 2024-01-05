import fetchMock from "fetch-mock";
import DatasetEditor from "metabase/query_builder/components/DatasetEditor";
import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import type { Card, UnsavedCard } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockNativeDatasetQuery,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import Question from "metabase-lib/Question";

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

const renderDatasetEditor = (card: Card | UnsavedCard) => {
  setupDatabasesEndpoints([TEST_DB]);
  setupCollectionsEndpoints({ collections: [ROOT_COLLECTION] });
  setupNativeQuerySnippetEndpoints();
  const question = new Question(card);

  const props = {
    question: question,
    params: { slug: "query" },
    datasetEditorTab: "query",
    isMetadataDirty: false,
    parameterValues: {},
    query: question.legacyQuery(),
    isDirty: false,
    isRunning: true,
    setQueryBuilderMode: () => null,
    setFieldMetadata: () => null,
    onSave: () => null,
    onCancelCreateNewModel: () => null,
    onCancelDatasetChanges: () => null,
    handleResize: () => null,
    runQuestionQuery: () => null,
    onOpenModal: () => null,
    isShowingTemplateTagsEditor: false,
    isShowingDataReference: false,
    isShowingSnippetSidebar: false,
    toggleTemplateTagsEditor: () => null,
    toggleDataReference: () => null,
    toggleSnippetSidebar: () => null,
  };
  renderWithProviders(<DatasetEditor {...props} />);
};

describe("DatasetEditor", () => {
  beforeEach(() => {
    fetchMock.get("path:/api/search", () => ({ body: { data: [] } }));
    fetchMock.get("path:/api/model-index", () => ({ body: { data: [] } }));
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it("tries to load a model index when card is already saved", async () => {
    renderDatasetEditor(mockSavedCard);
    const calls = fetchMock.calls("path:/api/model-index");
    expect(calls).toHaveLength(1);
    expect(
      new URL(calls[0]?.request?.url ?? "").searchParams.get("model_id"),
    ).toBe(`${mockSavedCard.id}`);
  });
  it("does not try to load a model index when card is unsaved", async () => {
    renderDatasetEditor(mockUnsavedCard);
    const calls = fetchMock.calls("path:/api/model-index");
    expect(calls).toHaveLength(0);
  });
});

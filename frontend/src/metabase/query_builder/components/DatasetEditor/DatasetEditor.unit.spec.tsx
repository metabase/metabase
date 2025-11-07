import fetchMock from "fetch-mock";

import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { DatasetEditor } from "metabase/query_builder/components/DatasetEditor";
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
const mockSavedModel = { ...mockSavedCard, type: "model" };
const mockSavedMetric = { ...mockSavedCard, type: "metric" };
const mockUnsavedCard = createMockUnsavedCard();

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
};

const renderDatasetEditor = async (card: Card | UnsavedCard) => {
  setupDatabasesEndpoints([TEST_DB]);
  setupCollectionsEndpoints({ collections: [ROOT_COLLECTION] });
  setupNativeQuerySnippetEndpoints();
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  const question = new Question(card);

  fetchMock.get("path:/api/search", { body: { data: [] } });
  fetchMock.get("path:/api/model-index", { body: [] });

  renderWithProviders(
    <DatasetEditor {...defaultDatasetEditorProps} question={question} />,
  );

  await screen.findByText("Query");
};

describe("DatasetEditor", () => {
  it("tries to load a model index for a saved model", async () => {
    await renderDatasetEditor(mockSavedModel);
    const calls = fetchMock.callHistory.calls("path:/api/model-index");
    expect(calls).toHaveLength(1);
    expect(
      new URL(calls[0]?.request?.url ?? "").searchParams.get("model_id"),
    ).toBe(`${mockSavedModel.id}`);
  });

  it("does not try to load a model index for a saved question", async () => {
    await renderDatasetEditor(mockSavedCard);
    const calls = fetchMock.callHistory.calls("path:/api/model-index");
    expect(calls).toHaveLength(0);
  });

  it("does not try to load a model index for a saved metric", async () => {
    await renderDatasetEditor(mockSavedMetric);
    const calls = fetchMock.callHistory.calls("path:/api/model-index");
    expect(calls).toHaveLength(0);
  });

  it("does not try to load a model index when card is unsaved", async () => {
    await renderDatasetEditor(mockUnsavedCard);
    const calls = fetchMock.callHistory.calls("path:/api/model-index");
    expect(calls).toHaveLength(0);
  });
});

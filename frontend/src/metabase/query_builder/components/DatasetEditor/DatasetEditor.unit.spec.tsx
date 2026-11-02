import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { MODAL_TYPES } from "metabase/querying/constants";
import Question from "metabase-lib/v1/Question";
import type { Card, UnsavedCard } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockNativeDatasetQuery,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { DatasetEditor } from ".";

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
const mockUnsavedModel = { ...mockUnsavedCard, type: "model" };

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

type SetupOpts = {
  card: Card | UnsavedCard;
  isDirty?: boolean;
};

const setup = async ({ card, isDirty = false }: SetupOpts) => {
  setupDatabasesEndpoints([TEST_DB]);
  setupCollectionsEndpoints({ collections: [ROOT_COLLECTION] });
  setupNativeQuerySnippetEndpoints();
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupUserMetabotPermissionsEndpoint();
  const metadata = createMockMetadata({ databases: [TEST_DB] });
  const question = new Question(card, metadata);
  const onOpenModal = jest.fn<void, [string]>();

  fetchMock.get("path:/api/search", { body: { data: [] } });
  fetchMock.get("path:/api/model-index", { body: [] });

  renderWithProviders(
    <DatasetEditor
      {...defaultDatasetEditorProps}
      question={question}
      isDirty={isDirty}
      onOpenModal={onOpenModal}
    />,
  );

  await screen.findByText("Query");

  return { onOpenModal };
};

describe("DatasetEditor", () => {
  it("tries to load a model index for a saved model", async () => {
    await setup({ card: mockSavedModel });
    const calls = fetchMock.callHistory.calls("path:/api/model-index");
    expect(calls).toHaveLength(1);
    expect(
      new URL(calls[0]?.request?.url ?? "").searchParams.get("model_id"),
    ).toBe(`${mockSavedModel.id}`);
  });

  it("does not try to load a model index for a saved question", async () => {
    await setup({ card: mockSavedCard });
    const calls = fetchMock.callHistory.calls("path:/api/model-index");
    expect(calls).toHaveLength(0);
  });

  it("does not try to load a model index for a saved metric", async () => {
    await setup({ card: mockSavedMetric });
    const calls = fetchMock.callHistory.calls("path:/api/model-index");
    expect(calls).toHaveLength(0);
  });

  it("does not try to load a model index when card is unsaved", async () => {
    await setup({ card: mockUnsavedCard });
    const calls = fetchMock.callHistory.calls("path:/api/model-index");
    expect(calls).toHaveLength(0);
  });

  it("does not show the saved state after opening the save modal for a new model (metabase#75461)", async () => {
    const { onOpenModal } = await setup({
      card: mockUnsavedModel,
      isDirty: true,
    });
    const saveButton = screen.getByRole("button", { name: "Save" });

    await userEvent.click(saveButton);

    await waitFor(() =>
      expect(onOpenModal).toHaveBeenCalledWith(MODAL_TYPES.SAVE),
    );
    await waitFor(() =>
      expect(saveButton).not.toHaveAttribute("data-action-status", "pending"),
    );
    expect(saveButton).toHaveAttribute("data-action-status", "idle");
    expect(saveButton).toHaveTextContent(/^Save$/);
  });
});

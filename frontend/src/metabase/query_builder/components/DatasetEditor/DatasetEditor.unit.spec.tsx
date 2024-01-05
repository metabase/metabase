import fetchMock from "fetch-mock";
import DatasetEditor from "metabase/query_builder/components/DatasetEditor";
import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import type { Card, UnsavedCard} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockNativeDatasetQuery,
  createMockUnsavedCard
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/Question";

const TEST_DB = createSampleDatabase();

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

const ROOT_COLLECTION = createMockCollection({ id: "root" });

const setup = ({ card }: { card: Card | UnsavedCard } ) => {
  setupDatabasesEndpoints([TEST_DB]);
  setupCollectionsEndpoints({ collections: [ROOT_COLLECTION] });
  setupNativeQuerySnippetEndpoints();

  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases: [TEST_DB],
      questions: 'id' in card ? [card] : [],
    }),
  });
  const metadata = getMetadata(storeInitialState);
  const question = new Question(card); //checkNotNull(metadata.question(card.id));

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

  const { rerender } = renderWithProviders(<DatasetEditor {...props} />);

  return { question, rerender };
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
    setup({ card: mockSavedCard });
    const calls = fetchMock.calls("path:/api/model-index");
    expect(calls).toHaveLength(1);
    expect(
      new URL(calls[0]?.request?.url ?? "").searchParams.get("model_id"),
    ).toBe(`${mockSavedCard.id}`);
  });
  it("does not try to load a model index when card is unsaved", async () => {
    setup({ card: mockUnsavedCard });
    const calls = fetchMock.calls("path:/api/model-index");
    expect(calls).toHaveLength(0);
  });
})

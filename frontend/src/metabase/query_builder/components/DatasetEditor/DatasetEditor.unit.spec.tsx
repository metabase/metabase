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

const setup = async ({ card }: { card: Card | UnsavedCard } ) => {
  setupDatabasesEndpoints([TEST_DB]);
  setupCollectionsEndpoints({ collections: [ROOT_COLLECTION] });
  setupNativeQuerySnippetEndpoints();

  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
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
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it("tries to load a model index when a model_id is specified", async () => {
    fetchMock.get(
      "path:/api/model-index",
      (_: any, __: any, request: Request) => {
        const params = new URL(request.url).searchParams;
        expect(params.get("model_id")).toBe(`${mockSavedCard.id}`);
        return { body: { data: [] } };
      },
    );
    await setup({ card: mockSavedCard });
  });
  it("does not try to load a model index when model_id is absent", async () => {
    fetchMock.get("*", () => ({ body: { data: [] } }));
    await setup({ card: mockUnsavedCard });
    expect(fetchMock.calls("path:/api/model-index")).toHaveLength(0);
  });
});

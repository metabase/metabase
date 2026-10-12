import { createMockMetadata } from "__support__/metadata";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockDatabase,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";

import type { TemplateTagsSidebarProps } from "../../../types";

import { NativeQuerySidebar } from "./NativeQuerySidebar";

const TemplateTagsSidebarStub = jest.fn((_props: TemplateTagsSidebarProps) => (
  <div data-testid="template-tags-sidebar" />
));

type SetupOpts = {
  isDataReferenceOpen?: boolean;
  isTemplateTagsSidebarOpen?: boolean;
};

function setup({
  isDataReferenceOpen = false,
  isTemplateTagsSidebarOpen = false,
}: SetupOpts = {}) {
  const database = createMockDatabase();
  const metadata = createMockMetadata({ databases: [database] });
  const question = new Question(
    createMockCard({
      dataset_query: createMockNativeDatasetQuery({ database: database.id }),
    }),
    metadata,
  );
  const query = question.query();
  const parameterValues = { tag: "value" };
  const onChangeQuery = jest.fn();
  const setParameterValues = jest.fn();
  const onToggleTemplateTagsSidebar = jest.fn();

  setupDatabasesEndpoints([database]);
  setupSearchEndpoints([]);

  renderWithProviders(
    <NativeQuerySidebar
      question={question}
      query={query}
      isNative
      isDataReferenceOpen={isDataReferenceOpen}
      isTemplateTagsSidebarOpen={isTemplateTagsSidebarOpen}
      parameterValues={parameterValues}
      setParameterValues={setParameterValues}
      parametersAreUserVisible={false}
      canUseSampleDatabase={false}
      onChangeQuery={onChangeQuery}
      onInsertSnippet={jest.fn()}
      onToggleDataReference={jest.fn()}
      onToggleSnippetSidebar={jest.fn()}
      onToggleTemplateTagsSidebar={onToggleTemplateTagsSidebar}
      onChangeModalSnippet={jest.fn()}
      onOpenSnippetModalWithSelectedText={jest.fn()}
      templateTagsSidebar={TemplateTagsSidebarStub}
    />,
  );

  return {
    database,
    question,
    query,
    parameterValues,
    onChangeQuery,
    setParameterValues,
    onToggleTemplateTagsSidebar,
  };
}

describe("NativeQuerySidebar", () => {
  beforeEach(() => {
    TemplateTagsSidebarStub.mockClear();
  });

  it("should render nothing when no sidebar is open", () => {
    setup();

    expect(screen.queryByTestId("editor-sidebar")).not.toBeInTheDocument();
  });

  it("should render the injected template tags sidebar when the variables sidebar is open", () => {
    const {
      question,
      query,
      parameterValues,
      onChangeQuery,
      setParameterValues,
      onToggleTemplateTagsSidebar,
    } = setup({ isTemplateTagsSidebarOpen: true });

    expect(screen.getByTestId("template-tags-sidebar")).toBeInTheDocument();
    const [props] = TemplateTagsSidebarStub.mock.calls[0];
    expect(props).toEqual({
      question,
      query,
      parameterValues,
      parametersAreUserVisible: false,
      canUseSampleDatabase: false,
      onChangeQuery,
      setParameterValues,
      onClose: onToggleTemplateTagsSidebar,
    });
  });

  it("should render the data reference for the question's database when that sidebar is open", async () => {
    const { database } = setup({ isDataReferenceOpen: true });

    await waitForLoaderToBeRemoved();

    expect(screen.getByText(database.name)).toBeInTheDocument();
    expect(TemplateTagsSidebarStub).not.toHaveBeenCalled();
  });
});

import userEvent from "@testing-library/user-event";

import {
  setupDatabasesEndpoints,
  setupParameterValuesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockDatabase,
  createMockNativeDatasetQuery,
  createMockTemplateTag,
} from "metabase-types/api/mocks";

import { NativeQuerySidebar } from "./NativeQuerySidebar";

const SAMPLE_DB_ID = 1;
const WRITABLE_DB_ID = 2;

interface SetupOpts {
  canUseSampleDatabase?: boolean;
}

const setup = ({ canUseSampleDatabase }: SetupOpts = {}) => {
  const sampleDatabase = createMockDatabase({
    id: SAMPLE_DB_ID,
    name: "Sample Database",
    is_sample: true,
  });
  const writableDatabase = createMockDatabase({
    id: WRITABLE_DB_ID,
    name: "Writable Postgres",
    engine: "postgres",
  });
  const card = createMockCard({
    dataset_query: createMockNativeDatasetQuery({
      database: WRITABLE_DB_ID,
      native: {
        query: "SELECT {{x}}",
        "template-tags": {
          x: createMockTemplateTag({
            name: "x",
            "display-name": "X",
            type: "text",
          }),
        },
      },
    }),
  });
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [sampleDatabase, writableDatabase],
    }),
  });
  const metadata = getMetadata(state);
  const question = new Question(card, metadata);

  setupDatabasesEndpoints([sampleDatabase, writableDatabase]);
  setupSearchEndpoints([]);
  setupParameterValuesEndpoints({ values: [], has_more_values: false });

  renderWithProviders(
    <NativeQuerySidebar
      question={question}
      query={question.query()}
      isNative
      isTemplateTagsSidebarOpen
      onChangeQuery={jest.fn()}
      onInsertSnippet={jest.fn()}
      onToggleDataReference={jest.fn()}
      onToggleSnippetSidebar={jest.fn()}
      onToggleTemplateTagsSidebar={jest.fn()}
      onChangeModalSnippet={jest.fn()}
      onOpenSnippetModalWithSelectedText={jest.fn()}
      parameterValues={{}}
      setParameterValues={jest.fn()}
      canUseSampleDatabase={canUseSampleDatabase}
    />,
    { storeInitialState: state },
  );
};

describe("NativeQuerySidebar template-tag help", () => {
  it("hides the 'Try it' examples when the sample database can't be used, e.g. in transforms (metabase#78037)", async () => {
    setup({ canUseSampleDatabase: false });

    await userEvent.click(screen.getByRole("tab", { name: "Help" }));

    expect(
      screen.queryByRole("button", { name: "Try it" }),
    ).not.toBeInTheDocument();
  });

  it("shows the 'Try it' examples when the sample database is available", async () => {
    setup({});

    await userEvent.click(screen.getByRole("tab", { name: "Help" }));

    expect(
      screen.getAllByRole("button", { name: "Try it" }).length,
    ).toBeGreaterThan(0);
  });
});

import {
  setupDatabasesEndpoints,
  setupParameterValuesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import { checkNotNull } from "metabase/utils/types";
import Question from "metabase-lib/v1/Question";
import type { TemplateTag } from "metabase-types/api";
import {
  createMockCard,
  createMockNativeDatasetQuery,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { TagEditorSidebar } from "./TagEditorSidebar";

interface SetupOpts {
  query: string;
  templateTags?: Record<string, TemplateTag>;
}

const setup = ({ query, templateTags = {} }: SetupOpts) => {
  const database = createSampleDatabase();
  const card = createMockCard({
    dataset_query: createMockNativeDatasetQuery({
      database: database.id,
      native: { query, "template-tags": templateTags },
    }),
  });
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [database] }),
  });
  const metadata = getMetadata(state);
  const question = new Question(card, metadata);

  setupDatabasesEndpoints([database]);
  setupSearchEndpoints([]);
  setupParameterValuesEndpoints({ values: [], has_more_values: false });

  renderWithProviders(
    <TagEditorSidebar
      query={checkNotNull(question.legacyNativeQuery())}
      question={question}
      databases={Object.values(metadata.databases)}
      setDatasetQuery={jest.fn()}
      setTemplateTag={jest.fn()}
      setTemplateTagConfig={jest.fn()}
      setParameterValue={jest.fn()}
      onClose={jest.fn()}
      getEmbeddedParameterVisibility={jest.fn()}
    />,
  );
};

describe("TagEditorSidebar", () => {
  it("hides the Settings/Help tabs when the query has no variables (metabase#78037)", () => {
    setup({ query: "SELECT 1" });

    expect(
      screen.queryByRole("tab", { name: "Settings" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Help" })).not.toBeInTheDocument();
    expect(screen.getByText("Read the full documentation")).toBeInTheDocument();
  });

  it("shows the Settings/Help tabs when the query has a variable", () => {
    setup({
      query: "SELECT {{x}}",
      templateTags: {
        x: createMockTemplateTag({
          name: "x",
          "display-name": "X",
          type: "text",
        }),
      },
    });

    expect(screen.getByRole("tab", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Help" })).toBeInTheDocument();
  });
});

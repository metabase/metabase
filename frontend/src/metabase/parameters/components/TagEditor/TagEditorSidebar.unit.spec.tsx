import userEvent from "@testing-library/user-event";

import { createMockMetadataFromState } from "__support__/metadata";
import {
  setupDatabasesEndpoints,
  setupParameterValuesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import Question from "metabase-lib/v1/Question";
import type { TemplateTag } from "metabase-types/api";
import {
  createMockCard,
  createMockNativeDatasetQuery,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import { PEOPLE, createSampleDatabase } from "metabase-types/api/mocks/presets";

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
  const metadata = createMockMetadataFromState(state);
  const question = new Question(card, metadata);

  setupDatabasesEndpoints([database]);
  setupSearchEndpoints([]);
  setupParameterValuesEndpoints({ values: [], has_more_values: false });

  const setTemplateTag = jest.fn<void, [TemplateTag]>();

  renderWithProviders(
    <TagEditorSidebar
      query={checkNotNull(question.legacyNativeQuery())}
      question={question}
      databases={Object.values(metadata.databases)}
      setDatasetQuery={jest.fn()}
      setTemplateTag={setTemplateTag}
      setTemplateTagConfig={jest.fn()}
      setParameterValue={jest.fn()}
      onClose={jest.fn()}
      getEmbeddedParameterVisibility={jest.fn()}
    />,
  );

  return { setTemplateTag };
};

describe("TagEditorSidebar", () => {
  it("keeps the Settings/Help tabs visible even when the query has no variables (metabase#78037)", () => {
    setup({ query: "SELECT 1" });

    expect(screen.getByRole("tab", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Help" })).toBeInTheDocument();
  });

  it("shows an empty state in the Settings tab when the query has no variables", () => {
    setup({ query: "SELECT 1" });

    expect(
      screen.getByText(/Add a variable to your query/),
    ).toBeInTheDocument();
  });

  it("shows the variable's settings when the query has a variable", () => {
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
    expect(
      screen.queryByText(/Add a variable to your query/),
    ).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("X")).toBeInTheDocument();
  });

  describe("field filter without a mapped field", () => {
    const FIELD_FILTER_TAG = createMockTemplateTag({
      name: "x",
      "display-name": "X",
      type: "dimension",
      dimension: undefined,
      "widget-type": "none",
    });

    it("should not render the default value and required controls (metabase#52812)", () => {
      setup({ query: "SELECT {{x}}", templateTags: { x: FIELD_FILTER_TAG } });

      expect(screen.getByText("Field to map to")).toBeInTheDocument();
      expect(
        screen.queryByText("Default filter widget value"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Always require a value"),
      ).not.toBeInTheDocument();
    });

    it("should render the default value and required controls once a field is mapped", () => {
      setup({
        query: "SELECT {{x}}",
        templateTags: {
          x: {
            ...FIELD_FILTER_TAG,
            dimension: ["field", PEOPLE.SOURCE, null],
            "widget-type": "string/=",
          },
        },
      });

      expect(
        screen.getByLabelText("Always require a value"),
      ).toBeInTheDocument();
    });

    it("should allow changing the variable type (metabase#51679)", async () => {
      const { setTemplateTag } = setup({
        query: "SELECT {{x}}",
        templateTags: { x: FIELD_FILTER_TAG },
      });

      await userEvent.click(screen.getByTestId("variable-type-select"));
      await userEvent.click(await screen.findByText("Number"));

      expect(setTemplateTag).toHaveBeenCalledTimes(1);
      expect(setTemplateTag).toHaveBeenCalledWith(
        expect.objectContaining({ name: "x", type: "number" }),
      );
    });
  });
});

import userEvent from "@testing-library/user-event";

import { createMockMetadataFromState } from "__support__/metadata";
import {
  setupDatabaseListEndpoint,
  setupDatabasesEndpoints,
  setupParameterValuesEndpoints,
  setupSchemaEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import Question from "metabase-lib/v1/Question";
import type { TableId, TemplateTag } from "metabase-types/api";
import {
  createMockCard,
  createMockNativeDatasetQuery,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import {
  PEOPLE,
  PRODUCTS,
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { TagEditorSidebar } from "./TagEditorSidebar";

interface SetupOpts {
  query: string;
  templateTags?: Record<string, TemplateTag>;
  /**
   * Simulates opening a saved question directly: the store has only these tables, and the database list response has no tables.
   */
  loadedTableIds?: TableId[];
}

const setup = ({ query, templateTags = {}, loadedTableIds }: SetupOpts) => {
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

  setupSearchEndpoints([]);
  setupParameterValuesEndpoints({ values: [], has_more_values: false });

  const setTemplateTag = jest.fn<void, [TemplateTag]>();
  const props = {
    query: checkNotNull(question.legacyNativeQuery()),
    question,
    setDatasetQuery: jest.fn(),
    setTemplateTag,
    setTemplateTagConfig: jest.fn(),
    setParameterValue: jest.fn(),
    onClose: jest.fn(),
    getEmbeddedParameterVisibility: jest.fn(),
  };

  if (loadedTableIds) {
    const databaseWithoutTables = { ...database, tables: undefined };
    setupDatabaseListEndpoint([databaseWithoutTables]);
    setupSchemaEndpoints(database);
    database.tables?.forEach((table) =>
      setupTableEndpoints({ ...table, db: databaseWithoutTables }),
    );
    renderWithProviders(<TagEditorSidebar {...props} />, {
      storeInitialState: createMockState({
        entities: createMockEntitiesState({
          databases: [databaseWithoutTables],
          tables: database.tables?.filter((table) =>
            loadedTableIds.includes(table.id),
          ),
        }),
      }),
    });
  } else {
    setupDatabasesEndpoints([database]);
    renderWithProviders(
      <TagEditorSidebar
        {...props}
        databases={Object.values(metadata.databases)}
      />,
    );
  }

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

  it("should list all tables of the database in the field picker of a mapped field filter (metabase#19451)", async () => {
    const tag = createMockTemplateTag({
      name: "x",
      "display-name": "X",
      type: "dimension",
      dimension: ["field", PRODUCTS.CATEGORY, null],
      "widget-type": "string/=",
    });
    const { setTemplateTag } = setup({
      query: "SELECT {{x}}",
      templateTags: { x: tag },
      loadedTableIds: [PRODUCTS_ID],
    });

    await userEvent.click(await screen.findByText("Category"));
    const popover = await screen.findByRole("dialog");
    await userEvent.click(await within(popover).findByText("Products"));

    expect(await within(popover).findByText("Orders")).toBeInTheDocument();
    expect(within(popover).getByText("Reviews")).toBeInTheDocument();
    await userEvent.click(within(popover).getByText("People"));
    await userEvent.click(await within(popover).findByText("Address"));

    expect(setTemplateTag).toHaveBeenCalledWith({
      ...tag,
      dimension: ["field", PEOPLE.ADDRESS, null],
    });
  });

  it("should show only one popover at a time and close it on an outside click (metabase#52811)", async () => {
    setup({
      query: "SELECT {{x}}",
      templateTags: {
        x: createMockTemplateTag({
          name: "x",
          "display-name": "X",
          type: "dimension",
          dimension: undefined,
          "widget-type": "none",
        }),
      },
    });

    const fieldPicker = await screen.findByRole("dialog");
    expect(await within(fieldPicker).findByText("Orders")).toBeInTheDocument();

    await userEvent.click(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Select..."));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Orders");

    await userEvent.click(screen.getByTestId("variable-type-select"));
    expect(await screen.findByText("Field Filter")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

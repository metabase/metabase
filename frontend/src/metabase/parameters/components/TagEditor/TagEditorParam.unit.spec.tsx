import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadataFromState } from "__support__/metadata";
import {
  setupDatabasesEndpoints,
  setupParameterSearchValuesEndpoint,
  setupParameterValuesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  createMockQueryBuilderState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { getTemplateTagParameter } from "metabase-lib/v1/parameters/utils/template-tags";
import type {
  Card,
  Database,
  Field,
  FieldId,
  Parameter,
  ParameterValues,
  TemplateTag,
  TemplateTagType,
  TemporalUnit,
} from "metabase-types/api";
import {
  createMockCard,
  createMockFieldDimension,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  PEOPLE,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { TagEditorParam } from "./TagEditorParam";

interface SetupOpts {
  tag?: TemplateTag;
  parameter?: Parameter;
  parameterValues?: ParameterValues;
  originalCard?: Card;
  transformDatabase?: (database: Database) => void;
}

const setup = ({
  tag = createMockTemplateTag(),
  parameter = getTemplateTagParameter(tag),
  parameterValues = { values: [], has_more_values: false },
  originalCard,
  transformDatabase,
}: SetupOpts = {}) => {
  const database = createSampleDatabase();
  transformDatabase?.(database);
  const state = createMockState({
    qb: createMockQueryBuilderState({
      card: createMockCard({
        dataset_query: Lib.toJsQuery(
          Lib.createTestNativeQuery(SAMPLE_PROVIDER, { query: "SELECT 1" }),
        ),
      }),
      originalCard,
    }),
    entities: createMockEntitiesState({
      databases: [database],
    }),
  });

  const metadata = createMockMetadataFromState(state);

  setupDatabasesEndpoints([database]);
  setupSearchEndpoints([]);
  setupParameterValuesEndpoints(parameterValues);

  const setTemplateTag = jest.fn();
  const setTemplateTagConfig = jest.fn();
  const setParameterValue = jest.fn();

  renderWithProviders(
    <TagEditorParam
      tag={tag}
      databaseId={database.id}
      parameter={parameter}
      originalQuestion={
        originalCard ? new Question(originalCard, metadata) : undefined
      }
      setTemplateTag={setTemplateTag}
      setTemplateTagConfig={setTemplateTagConfig}
      setParameterValue={setParameterValue}
    />,
    { storeInitialState: state },
  );

  return { setTemplateTag, setTemplateTagConfig, setParameterValue };
};

describe("TagEditorParam", () => {
  describe("dimension field fetching", () => {
    it("fetches the dimension field and its remapped field when mounting a dimension tag", async () => {
      setup({
        tag: createMockTemplateTag({
          type: "dimension",
          "field-id": PEOPLE.NAME,
          "widget-type": "string/=",
        }),
        transformDatabase: (database) => {
          const peopleField = findFieldInDatabase(database, PEOPLE.NAME);
          peopleField.dimensions = [
            createMockFieldDimension({
              type: "external",
              human_readable_field_id: PEOPLE.SOURCE,
            }),
          ];
        },
      });

      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls(`path:/api/field/${PEOPLE.NAME}`),
        ).toHaveLength(1);
      });
      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls(`path:/api/field/${PEOPLE.SOURCE}`),
        ).toHaveLength(1);
      });
    });

    it("does not fetch a remapped field when the dimension has no remap", async () => {
      setup({
        tag: createMockTemplateTag({
          type: "dimension",
          "field-id": PEOPLE.NAME,
          "widget-type": "string/=",
        }),
      });

      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls(`path:/api/field/${PEOPLE.NAME}`),
        ).toHaveLength(1);
      });
      expect(
        fetchMock.callHistory.calls(`path:/api/field/${PEOPLE.SOURCE}`),
      ).toHaveLength(0);
    });
  });

  describe("tag name", () => {
    it("should be able to update the name of the tag", async () => {
      const tag = createMockTemplateTag();
      const { setTemplateTag } = setup({ tag });

      const input = screen.getByRole("textbox", {
        name: "Filter widget label",
      });
      await userEvent.clear(input);
      await userEvent.type(input, "New");
      await userEvent.tab();

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        "display-name": "New",
      });
    });
  });

  describe("tag type", () => {
    it("should be able to change the type of the tag", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": PEOPLE.NAME,
        "widget-type": "string/starts-with",
      });
      const { setTemplateTag } = setup({ tag });

      await userEvent.click(screen.getByTestId("variable-type-select"));
      await userEvent.click(screen.getByText("Field Filter"));
      await userEvent.click(screen.getByTestId("variable-type-select"));
      await userEvent.click(screen.getByText("Number"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        type: "number",
        default: undefined,
        "field-id": undefined,
        "widget-type": undefined,
      });
    });

    it("should clear the default value and the parameter value when the type is changed (metabase#11480)", async () => {
      const tag = createMockTemplateTag({
        type: "text",
        required: true,
        default: "some text",
      });
      const { setTemplateTag, setParameterValue } = setup({ tag });

      await userEvent.click(screen.getByTestId("variable-type-select"));
      await userEvent.click(screen.getByRole("option", { name: "Number" }));

      expect(setTemplateTag).toHaveBeenCalledTimes(1);
      expect(setTemplateTag).toHaveBeenCalledWith(
        expect.objectContaining({ type: "number", default: undefined }),
      );
      expect(setParameterValue).toHaveBeenCalledTimes(1);
      expect(setParameterValue).toHaveBeenCalledWith(tag.id, null);
    });

    it("should show the selected type of the tag (metabase#11580)", () => {
      setup({ tag: createMockTemplateTag({ type: "number" }) });

      expect(screen.getByTestId("variable-type-select")).toHaveValue("Number");
    });

    it("should be able to change the type of a text tag to a field filter (metabase#15700)", async () => {
      const tag = createMockTemplateTag({ type: "text" });
      const { setTemplateTag } = setup({ tag });

      await userEvent.click(screen.getByTestId("variable-type-select"));
      await userEvent.click(
        screen.getByRole("option", { name: "Field Filter" }),
      );

      expect(setTemplateTag).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "dimension",
          "field-id": undefined,
          "widget-type": "none",
        }),
      );
    });

    it("should be able to change the type of the tag to boolean", async () => {
      const tag = createMockTemplateTag({ type: "text" });
      const { setTemplateTag } = setup({ tag });

      await userEvent.click(screen.getByTestId("variable-type-select"));
      await userEvent.click(screen.getByText("Boolean"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        type: "boolean",
        default: undefined,
        "field-id": undefined,
        "widget-type": undefined,
      });
    });

    it("should not throw when the original question is an mbql query (metabase#50662)", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": PEOPLE.NAME,
        "widget-type": "string/starts-with",
      });
      const originalCard = createMockCard();
      const { setTemplateTag } = setup({ tag, originalCard });

      await userEvent.click(screen.getByTestId("variable-type-select"));
      await userEvent.click(screen.getByText("Field Filter"));
      await userEvent.click(screen.getByTestId("variable-type-select"));
      await userEvent.click(screen.getByText("Number"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        type: "number",
        default: undefined,
        "field-id": undefined,
        "widget-type": undefined,
      });
    });

    describe("values source of the saved question", () => {
      const savedTag = createMockTemplateTag({ type: "text" });
      const savedValuesSource: Pick<
        Parameter,
        "values_query_type" | "values_source_type" | "values_source_config"
      > = {
        values_query_type: "search",
        values_source_type: "static-list",
        values_source_config: { values: ["Foo", "Bar"] },
      };
      const originalCard = createMockCard({
        dataset_query: Lib.toJsQuery(
          Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
            query: `SELECT {{${savedTag.name}}}`,
            templateTags: {
              [savedTag.name]: { name: savedTag.name, type: "text" },
            },
          }),
        ),
        parameters: [
          { ...getTemplateTagParameter(savedTag), ...savedValuesSource },
        ],
      });

      it("should restore it when changing the type back to the saved type", async () => {
        const tag = { ...savedTag, type: "number" } as const;
        const { setTemplateTagConfig } = setup({ tag, originalCard });

        await userEvent.click(screen.getByTestId("variable-type-select"));
        await userEvent.click(screen.getByRole("option", { name: "Text" }));

        expect(setTemplateTagConfig).toHaveBeenCalledTimes(1);
        expect(setTemplateTagConfig).toHaveBeenCalledWith(
          tag,
          expect.objectContaining(savedValuesSource),
        );
      });

      it("should clear it when changing to a type other than the saved type", async () => {
        const { setTemplateTagConfig } = setup({
          tag: savedTag,
          originalCard,
        });

        await userEvent.click(screen.getByTestId("variable-type-select"));
        await userEvent.click(screen.getByRole("option", { name: "Number" }));

        expect(setTemplateTagConfig).toHaveBeenCalledTimes(1);
        expect(setTemplateTagConfig).toHaveBeenCalledWith(
          savedTag,
          expect.objectContaining({
            values_query_type: undefined,
            values_source_type: undefined,
            values_source_config: undefined,
          }),
        );
      });
    });

    it("should reset type-specific properties when the type is changed", async () => {
      const tag = createMockTemplateTag({
        type: "table",
        "table-id": 1,
      });
      const { setTemplateTag } = setup({ tag });

      await userEvent.click(screen.getByTestId("variable-type-select"));
      await userEvent.click(screen.getByText("Number"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        type: "number",
        "table-id": undefined,
      });

      expect(
        screen.getByRole("switch", { name: /use variable name as alias/i }),
      ).toBeChecked();

      await userEvent.click(
        screen.getByRole("switch", { name: /use variable name as alias/i }),
      );
      expect(setTemplateTag).toHaveBeenLastCalledWith(
        expect.objectContaining({
          "emit-alias": false,
        }),
      );
    });
  });

  describe("tag dimension", () => {
    it("should default to string/= for a new low cardinality string field filter", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": undefined,
        "widget-type": undefined,
      });
      const { setTemplateTag } = setup({ tag });

      await waitForElementsToLoad("People");

      await userEvent.click(await screen.findByText("People"));
      await userEvent.click(await screen.findByText("Source"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        "field-id": PEOPLE.SOURCE,
        "widget-type": "string/=",
        options: undefined,
      });
    }, 40000);

    it("should default to string/contains for a new high cardinality string field filter", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": undefined,
        "widget-type": undefined,
      });
      const { setTemplateTag } = setup({ tag });

      await waitForElementsToLoad("People");

      await userEvent.click(await screen.findByText("People"));
      await userEvent.click(await screen.findByText("Name"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        "field-id": PEOPLE.NAME,
        "widget-type": "string/contains",
        options: { "case-sensitive": false },
      });
    }, 40000);

    it("should default to number/= for a new numeric field filter", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": undefined,
        "widget-type": undefined,
      });
      const { setTemplateTag } = setup({ tag });

      await waitForElementsToLoad("Orders");

      await userEvent.click(await screen.findByText("Orders"));
      await userEvent.click(await screen.findByText("Quantity"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        "field-id": ORDERS.QUANTITY,
        "widget-type": "number/=",
        options: undefined,
      });
    }, 40000);

    it("should default to number/= for a new reviews->rating field filter (metabase#16151)", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": undefined,
        "widget-type": undefined,
      });
      const { setTemplateTag } = setup({ tag });

      await waitForElementsToLoad("Reviews");

      await userEvent.click(await screen.findByText("Reviews"));
      await userEvent.click(await screen.findByText("Rating"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        "field-id": REVIEWS.RATING,
        "widget-type": "number/=",
        options: undefined,
      });
    }, 40000);

    it("should default to id for a new primary key field filter (metabase#31606)", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": undefined,
        "widget-type": undefined,
      });
      const { setTemplateTag } = setup({ tag });

      await waitForElementsToLoad("Products");

      await userEvent.click(await screen.findByText("Products"));
      await userEvent.click(await screen.findByText("ID"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        "field-id": PRODUCTS.ID,
        "widget-type": "id",
        options: undefined,
      });
    }, 40000);

    it("should allow to change the field for a field filter", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": PEOPLE.NAME,
        "widget-type": "string/=",
      });
      const { setTemplateTag } = setup({ tag });

      await waitForElementsToLoad("Name");

      await userEvent.click(screen.getByText("Name"));
      await userEvent.click(await screen.findByText("Address"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        "field-id": PEOPLE.ADDRESS,
      });
    }, 40000);
  });

  describe("table id", () => {
    it("should be able to set the table id", async () => {
      const tag = createMockTemplateTag({
        type: "table",
        "table-id": undefined,
      });
      const { setTemplateTag } = setup({ tag });
      await userEvent.click(await screen.findByText("Products"));
      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        "table-id": PRODUCTS_ID,
      });
    });
  });

  describe("field alias", () => {
    it.each<TemplateTagType>(["dimension", "temporal-unit"])(
      "should be possible to set a field alias for %s variables",
      async (type) => {
        const tag = createMockTemplateTag({
          type,
          "field-id": PEOPLE.CREATED_AT,
          "widget-type": type === "dimension" ? "date/all-options" : undefined,
        });
        const { setTemplateTag } = setup({ tag });
        await userEvent.type(
          await screen.findByTestId("field-alias-input"),
          "p.created_at",
        );
        await userEvent.tab();
        expect(setTemplateTag).toHaveBeenCalledWith({
          ...tag,
          alias: "p.created_at",
        });
      },
    );

    it("should trim the field alias", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": PEOPLE.CREATED_AT,
        "widget-type": "date/all-options",
      });
      const { setTemplateTag } = setup({ tag });
      await userEvent.type(
        await screen.findByTestId("field-alias-input"),
        " p.created_at ",
      );
      await userEvent.tab();
      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        alias: "p.created_at",
      });
    });

    it.each<TemplateTagType>(["dimension", "temporal-unit"])(
      "should be possible to remove a field alias for %s variables",
      async (type) => {
        const tag = createMockTemplateTag({
          type,
          "field-id": PEOPLE.CREATED_AT,
          alias: "p.created_at",
          "widget-type": type === "dimension" ? "date/all-options" : undefined,
        });
        const { setTemplateTag } = setup({ tag });
        await userEvent.clear(await screen.findByTestId("field-alias-input"));
        await userEvent.tab();
        expect(setTemplateTag).toHaveBeenCalledWith({
          ...tag,
          alias: undefined,
        });
      },
    );

    it.each<TemplateTagType>(["text", "number", "date"])(
      "should not show the field alias input for %% variables",
      (type) => {
        const tag = createMockTemplateTag({ type });
        setup({ tag });
        expect(
          screen.queryByText("Table and field alias"),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByTestId("field-alias-input"),
        ).not.toBeInTheDocument();
      },
    );
  });

  describe("tag widget type", () => {
    it("should be able to set the widget type with options", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": PEOPLE.NAME,
        "widget-type": "string/=",
      });
      const { setTemplateTag } = setup({ tag });

      await userEvent.click(
        await screen.findByTestId("filter-widget-type-select"),
      );
      await userEvent.click(screen.getByText("String"));
      await userEvent.click(
        await screen.findByTestId("filter-widget-type-select"),
      );
      await userEvent.click(screen.getByText("String contains"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        default: null,
        "widget-type": "string/contains",
        options: { "case-sensitive": false },
      });
    });

    it("should be able to set the widget type without options", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": PEOPLE.NAME,
        "widget-type": "string/starts-with",
        options: { "case-sensitive": false },
      });
      const { setTemplateTag } = setup({ tag });

      await userEvent.click(
        await screen.findByTestId("filter-widget-type-select"),
      );
      await userEvent.click(screen.getByText("String starts with"));
      await userEvent.click(
        await screen.findByTestId("filter-widget-type-select"),
      );
      await userEvent.click(screen.getByText("String"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        default: null,
        "widget-type": "string/=",
        options: undefined,
      });
    });

    it("should be able to set a negated widget type for a category field (metabase#15700)", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": PRODUCTS.CATEGORY,
        "widget-type": "string/=",
      });
      const { setTemplateTag } = setup({ tag });

      await userEvent.click(
        await screen.findByTestId("filter-widget-type-select"),
      );
      await userEvent.click(screen.getByText("String is not"));

      expect(setTemplateTag).toHaveBeenCalledWith(
        expect.objectContaining({ "widget-type": "string/!=" }),
      );
    });

    it("should clear the default value and the parameter value when the widget type is changed (metabase#16756)", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": PRODUCTS.CREATED_AT,
        "widget-type": "date/range",
        default: "2027-03-31~2028-03-31",
      });
      const { setTemplateTag, setParameterValue } = setup({ tag });

      const select = await screen.findByTestId("filter-widget-type-select");
      expect(select).toHaveValue("Date Range");
      await userEvent.click(select);
      await userEvent.click(screen.getByText("Single Date"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        default: null,
        "widget-type": "date/single",
        options: undefined,
      });
      expect(setParameterValue).toHaveBeenCalledWith(tag.id, null);
    });

    it("should replace old location widget-type values with string/=", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": PEOPLE.NAME,
        "widget-type": "location/country",
      });
      setup({ tag });

      await userEvent.click(
        await screen.findByTestId("filter-widget-type-select"),
      );
      expect(screen.getByText("String")).toBeInTheDocument();
    });

    it("should show the legacy category widget-type as String", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": PRODUCTS.CATEGORY,
        "widget-type": "category",
      });
      setup({ tag });

      expect(
        await screen.findByTestId("filter-widget-type-select"),
      ).toHaveValue("String");
    });

    it("should show a disabled ID widget type for a PK field", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": PRODUCTS.ID,
        "widget-type": "id",
      });
      setup({ tag });

      const select = await screen.findByTestId("filter-widget-type-select");
      expect(select).toHaveValue("ID");
      expect(select).toBeDisabled();
    });
  });

  describe("tag required", () => {
    it("should be able to make the tag required", async () => {
      const tag = createMockTemplateTag();
      const { setTemplateTag } = setup({ tag });

      const toggleLabel = screen.getByText("Always require a value");
      await userEvent.click(toggleLabel);

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        required: true,
      });
    });

    it("should set the default value when turning required on", async () => {
      const tag = createMockTemplateTag({ default: "123" });
      const { setParameterValue } = setup({ tag });

      const toggleLabel = screen.getByText("Always require a value");
      await userEvent.click(toggleLabel);

      expect(setParameterValue).toHaveBeenCalledWith(tag.id, "123");
    });

    it("should not clear the default value when turning required off", async () => {
      const tag = createMockTemplateTag({ required: true, default: "abc" });
      const { setTemplateTag } = setup({ tag });

      const toggleLabel = screen.getByText("Always require a value");
      await userEvent.click(toggleLabel);

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        required: false,
        default: "abc",
      });
    });
  });

  describe("default value", () => {
    it("should mark a required tag without a default value", () => {
      setup({ tag: createMockTemplateTag({ required: true }) });

      expect(screen.getByText("Default filter widget value")).toHaveTextContent(
        "Default filter widget value (required)",
      );
    });

    it.each([
      { required: false, default: undefined },
      { required: true, default: "a" },
    ])(
      "should not mark a tag that is required=$required with default=$default",
      (opts) => {
        setup({ tag: createMockTemplateTag(opts) });

        expect(
          screen.getByText("Default filter widget value"),
        ).toHaveTextContent(/^Default filter widget value$/);
      },
    );

    it.each([false, true])(
      "should clear the default value with required=%s",
      async (required) => {
        const tag = createMockTemplateTag({ required, default: "a" });
        const { setTemplateTag, setParameterValue } = setup({ tag });

        await userEvent.click(screen.getByRole("button", { name: "Clear" }));

        expect(setTemplateTag).toHaveBeenCalledWith({ ...tag, default: null });
        expect(setParameterValue).toHaveBeenCalledWith(tag.id, null);
      },
    );

    it("should set the default value and the parameter value of a text tag (metabase#11480)", async () => {
      const tag = createMockTemplateTag({ type: "text", required: true });
      const { setTemplateTag, setParameterValue } = setup({ tag });

      await userEvent.click(screen.getByLabelText("Enter a default value…"));
      await userEvent.type(
        await screen.findByPlaceholderText("Enter a default value…"),
        "some text{enter}",
      );

      expect(setTemplateTag).toHaveBeenLastCalledWith({
        ...tag,
        default: ["some text"],
      });
      expect(setParameterValue).toHaveBeenLastCalledWith(tag.id, ["some text"]);
    });

    it("should set the default value of a field filter to null when its last value is removed (metabase#31606)", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": PRODUCTS.ID,
        "widget-type": "id",
        default: "2",
      });
      const { setTemplateTag } = setup({ tag });

      const defaultValue = await screen.findByText("2");
      expect(
        screen.queryByText("Enter a default value…"),
      ).not.toBeInTheDocument();

      await userEvent.click(defaultValue);
      await userEvent.click(await screen.findByLabelText("Remove"));
      await userEvent.click(
        screen.getByRole("button", { name: "Update filter" }),
      );

      expect(setTemplateTag).toHaveBeenLastCalledWith({
        ...tag,
        default: null,
      });
    });

    describe("static list values source (metabase#44665, metabase#49577)", () => {
      const values: ParameterValues["values"] = [
        ["foo"],
        ["bar"],
        ["baz"],
        ["foobar"],
      ];
      const tag = createMockTemplateTag({ type: "text" });

      const setupStaticList = (queryType: "search" | "list") =>
        setup({
          tag,
          parameter: {
            ...getTemplateTagParameter(tag),
            values_query_type: queryType,
            values_source_type: "static-list",
            values_source_config: { values },
          },
          parameterValues: { values, has_more_values: false },
        });

      it("should use a search input for the default value of a search box", async () => {
        setupParameterSearchValuesEndpoint("foo", {
          values: [["foo"], ["foobar"]],
          has_more_values: false,
        });
        setupStaticList("search");

        await userEvent.click(screen.getByText("Enter a default value…"));
        const input = await screen.findByPlaceholderText(
          "Enter a default value…",
        );
        expect(screen.queryByText("foo")).not.toBeInTheDocument();
        expect(screen.queryByText("bar")).not.toBeInTheDocument();

        await userEvent.type(input, "foo");
        expect(await screen.findByText("foobar")).toBeInTheDocument();
        expect(screen.getByText("foo")).toBeInTheDocument();
        expect(screen.queryByText("bar")).not.toBeInTheDocument();
        expect(screen.queryByText("baz")).not.toBeInTheDocument();
      });

      it("should list all values for the default value of a dropdown list", async () => {
        setupStaticList("list");

        await userEvent.click(screen.getByText("Enter a default value…"));
        expect(
          await screen.findByPlaceholderText("Enter a default value…"),
        ).toBeInTheDocument();
        expect(await screen.findByText("foo")).toBeInTheDocument();
        expect(screen.getByText("bar")).toBeInTheDocument();
        expect(screen.getByText("baz")).toBeInTheDocument();
        expect(screen.getByText("foobar")).toBeInTheDocument();
      });
    });

    it("should show the labels of a static list when picking the default value", async () => {
      const values: ParameterValues["values"] = [
        [10, "Ten"],
        [20, "Twenty"],
        [30],
      ];
      const tag = createMockTemplateTag({ type: "number" });
      const { setTemplateTag } = setup({
        tag,
        parameter: {
          ...getTemplateTagParameter(tag),
          values_query_type: "list",
          values_source_type: "static-list",
          values_source_config: { values },
        },
        parameterValues: { values, has_more_values: false },
      });

      await userEvent.click(screen.getByText("Enter a default value…"));
      expect(await screen.findByText("Ten")).toBeInTheDocument();
      expect(screen.getByText("Twenty")).toBeInTheDocument();
      expect(screen.getByText("30")).toBeInTheDocument();
      expect(screen.queryByText("20")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("Twenty"));
      await userEvent.click(screen.getByRole("button", { name: "Add filter" }));

      expect(setTemplateTag).toHaveBeenCalledWith({ ...tag, default: [20] });
    });
  });

  describe("time grouping", () => {
    const TIME_GROUPING_OPTIONS: TemporalUnit[] = ["month", "year"];

    const getTimeGroupingTag = (opts?: Partial<TemplateTag>) =>
      createMockTemplateTag({
        type: "temporal-unit",
        name: "unit",
        "display-name": "Unit",
        "field-id": ORDERS.CREATED_AT,
        ...opts,
      });

    it("should be able to update the parameter widget label", async () => {
      const tag = getTimeGroupingTag();
      const { setTemplateTag } = setup({ tag });

      await userEvent.type(
        screen.getByRole("textbox", { name: "Parameter widget label" }),
        " updated",
      );
      await userEvent.tab();

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        "display-name": "Unit updated",
      });
    });

    it("should be able to set a default time grouping", async () => {
      const tag = getTimeGroupingTag({ required: true });
      const { setTemplateTag } = setup({ tag });

      await userEvent.click(screen.getByText("Enter a default value…"));
      await userEvent.click(await screen.findByText("Year"));

      expect(setTemplateTag).toHaveBeenCalledWith({ ...tag, default: "year" });
    });

    it("should reset the default value when it is removed from the time grouping options", async () => {
      const tag = getTimeGroupingTag({ default: "year" });
      const parameter = {
        ...getTemplateTagParameter(tag),
        temporal_units: TIME_GROUPING_OPTIONS,
      };
      const { setTemplateTag, setTemplateTagConfig, setParameterValue } = setup(
        { tag, parameter },
      );

      await userEvent.click(screen.getByText("Month, Year"));
      await userEvent.click(await screen.findByLabelText("Year"));

      expect(setTemplateTagConfig).toHaveBeenCalledWith(tag, {
        temporal_units: ["month"],
      });
      expect(setTemplateTag).toHaveBeenCalledWith({ ...tag, default: null });
      expect(setParameterValue).toHaveBeenCalledWith(tag.id, null);
    });

    it("should keep the default value when it stays in the time grouping options", async () => {
      const tag = getTimeGroupingTag({ default: "year" });
      const parameter = {
        ...getTemplateTagParameter(tag),
        temporal_units: TIME_GROUPING_OPTIONS,
      };
      const { setTemplateTag, setTemplateTagConfig, setParameterValue } = setup(
        { tag, parameter },
      );

      await userEvent.click(screen.getByText("Month, Year"));
      await userEvent.click(await screen.findByLabelText("Month"));

      expect(setTemplateTagConfig).toHaveBeenCalledWith(tag, {
        temporal_units: ["year"],
      });
      expect(setTemplateTag).not.toHaveBeenCalled();
      expect(setParameterValue).not.toHaveBeenCalled();
    });
  });

  describe("multi select", () => {
    it.each<TemplateTagType>(["text", "number"])(
      "should support single and multiple values with %s variables",
      async (type) => {
        const tag = createMockTemplateTag({ type });
        setup({ tag });
        expect(screen.getByLabelText("Multiple values")).toBeInTheDocument();
        expect(screen.getByLabelText("A single value")).toBeInTheDocument();

        await userEvent.hover(screen.getByTestId("multi-select-info-icon"));
        expect(await screen.findByText(/category IN/)).toBeInTheDocument();
      },
    );

    it("should support single and multiple values with field filters", () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        "field-id": PEOPLE.SOURCE,
      });
      setup({ tag });
      expect(screen.getByLabelText("Multiple values")).toBeInTheDocument();
      expect(screen.getByLabelText("A single value")).toBeInTheDocument();
      expect(
        screen.queryByTestId("multi-select-info-icon"),
      ).not.toBeInTheDocument();
    });

    it("should not support single and multiple values with date variables", () => {
      const tag = createMockTemplateTag({ type: "date" });
      setup({ tag });
      expect(
        screen.queryByLabelText("Multiple values"),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText("A single value")).not.toBeInTheDocument();
    });

    it("should not support single and multiple values with time grouping", () => {
      const tag = createMockTemplateTag({
        type: "temporal-unit",
        "field-id": PEOPLE.CREATED_AT,
      });
      setup({ tag });
      expect(
        screen.queryByLabelText("Multiple values"),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText("A single value")).not.toBeInTheDocument();
    });
  });
});

async function waitForElementsToLoad(text: string) {
  await waitFor(
    () => {
      expect(screen.getByText(text)).toBeInTheDocument();
    },
    { timeout: 20000 },
  );
}

function findFieldInDatabase(database: Database, fieldId: FieldId): Field {
  for (const table of database.tables ?? []) {
    const field = table.fields?.find((field) => field.id === fieldId);
    if (field) {
      return field;
    }
  }
  throw new Error(`Field ${fieldId} not found in database ${database.id}`);
}

import userEvent from "@testing-library/user-event";

import {
  setupDatabasesEndpoints,
  setupParameterValuesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import { getTemplateTagParameter } from "metabase-lib/v1/parameters/utils/template-tags";
import type { Card, TemplateTag, TemplateTagType } from "metabase-types/api";
import {
  createMockCard,
  createMockNativeDatasetQuery,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  PEOPLE,
  PRODUCTS_ID,
  REVIEWS,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

import { TagEditorParam } from "./TagEditorParam";

interface SetupOpts {
  tag?: TemplateTag;
  originalCard?: Card;
}

const setup = ({
  tag = createMockTemplateTag(),
  originalCard,
}: SetupOpts = {}) => {
  const database = createSampleDatabase();
  const state = createMockState({
    qb: createMockQueryBuilderState({
      card: createMockCard({
        dataset_query: createMockNativeDatasetQuery(),
      }),
      originalCard,
    }),
    entities: createMockEntitiesState({
      databases: [database],
    }),
  });

  const metadata = getMetadata(state);

  const databaseMetadata = checkNotNull(metadata.database(database.id));

  setupDatabasesEndpoints([database]);
  setupSearchEndpoints([]);
  setupParameterValuesEndpoints({
    values: [],
    has_more_values: false,
  });

  const setTemplateTag = jest.fn();
  const setParameterValue = jest.fn();

  renderWithProviders(
    <TagEditorParam
      tag={tag}
      database={databaseMetadata}
      databases={metadata.databasesList()}
      parameter={getTemplateTagParameter(tag)}
      setTemplateTag={setTemplateTag}
      setParameterValue={setParameterValue}
    />,
    { storeInitialState: state },
  );

  return { setTemplateTag, setParameterValue };
};

describe("TagEditorParam", () => {
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
        dimension: ["field", PEOPLE.NAME, null],
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
        dimension: undefined,
        "widget-type": undefined,
      });
    });

    it("should not throw when the original question is an mbql query (metabase#50662)", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        dimension: ["field", PEOPLE.NAME, null],
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
        dimension: undefined,
        "widget-type": undefined,
      });
    });

    it("should reset type-specific properties when the type is changed", async () => {
      const tag = createMockTemplateTag({
        type: "table",
        "table-id": 1,
        alias: "my_table",
      });
      const { setTemplateTag } = setup({ tag });

      await userEvent.click(screen.getByTestId("variable-type-select"));
      await userEvent.click(screen.getByText("Number"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        type: "number",
        "table-id": undefined,
        alias: undefined,
      });
    });
  });

  describe("tag dimension", () => {
    it("should default to string/= for a new low cardinality string field filter", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        dimension: undefined,
        "widget-type": undefined,
      });
      const { setTemplateTag } = setup({ tag });

      await waitForElementsToLoad("People");

      await userEvent.click(await screen.findByText("People"));
      await userEvent.click(await screen.findByText("Source"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        dimension: ["field", PEOPLE.SOURCE, null],
        "widget-type": "string/=",
        options: undefined,
      });
    }, 40000);

    it("should default to string/contains for a new high cardinality string field filter", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        dimension: undefined,
        "widget-type": undefined,
      });
      const { setTemplateTag } = setup({ tag });

      await waitForElementsToLoad("People");

      await userEvent.click(await screen.findByText("People"));
      await userEvent.click(await screen.findByText("Name"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        dimension: ["field", PEOPLE.NAME, null],
        "widget-type": "string/contains",
        options: { "case-sensitive": false },
      });
    }, 40000);

    it("should default to number/= for a new numeric field filter", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        dimension: undefined,
        "widget-type": undefined,
      });
      const { setTemplateTag } = setup({ tag });

      await waitForElementsToLoad("Orders");

      await userEvent.click(await screen.findByText("Orders"));
      await userEvent.click(await screen.findByText("Quantity"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        dimension: ["field", ORDERS.QUANTITY, null],
        "widget-type": "number/=",
        options: undefined,
      });
    }, 40000);

    it("should default to number/= for a new reviews->rating field filter (metabase#16151)", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        dimension: undefined,
        "widget-type": undefined,
      });
      const { setTemplateTag } = setup({ tag });

      await waitForElementsToLoad("Reviews");

      await userEvent.click(await screen.findByText("Reviews"));
      await userEvent.click(await screen.findByText("Rating"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        dimension: ["field", REVIEWS.RATING, null],
        "widget-type": "number/=",
        options: undefined,
      });
    }, 40000);

    it("should allow to change the field for a field filter", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        dimension: ["field", PEOPLE.NAME, null],
        "widget-type": "string/=",
      });
      const { setTemplateTag } = setup({ tag });

      await waitForElementsToLoad("Name");

      await userEvent.click(screen.getByText("Name"));
      await userEvent.click(await screen.findByText("Address"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        dimension: ["field", PEOPLE.ADDRESS, null],
      });
    }, 40000);
  });

  describe("table id", () => {
    it("should reset the table alias when the table id is set", async () => {
      const tag = createMockTemplateTag({
        type: "table",
        "table-id": undefined,
        alias: "my_table",
      });
      const { setTemplateTag } = setup({ tag });
      await userEvent.click(screen.getByText("Select a table"));
      await userEvent.click(screen.getByText("Products"));
      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        "table-id": PRODUCTS_ID,
        alias: undefined,
      });
    });
  });

  describe("table alias", () => {
    it("should reset the table id when the table alias is set", async () => {
      const tag = createMockTemplateTag({
        type: "table",
        "table-id": PRODUCTS_ID,
        alias: undefined,
      });
      const { setTemplateTag } = setup({ tag });
      await userEvent.type(screen.getByTestId("table-alias-input"), "my_table");
      await userEvent.tab();
      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        "table-id": undefined,
        alias: "my_table",
      });
    });
  });

  describe("field alias", () => {
    it.each<TemplateTagType>(["dimension", "temporal-unit"])(
      "should be possible to set a field alias for %s variables",
      async (type) => {
        const tag = createMockTemplateTag({
          type,
          dimension: ["field", PEOPLE.CREATED_AT, null],
          "widget-type": type === "dimension" ? "date/all-options" : undefined,
        });
        const { setTemplateTag } = setup({ tag });
        await userEvent.type(
          screen.getByTestId("field-alias-input"),
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
        dimension: ["field", PEOPLE.CREATED_AT, null],
        "widget-type": "date/all-options",
      });
      const { setTemplateTag } = setup({ tag });
      await userEvent.type(
        screen.getByTestId("field-alias-input"),
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
          dimension: ["field", PEOPLE.CREATED_AT, null],
          alias: "p.created_at",
          "widget-type": type === "dimension" ? "date/all-options" : undefined,
        });
        const { setTemplateTag } = setup({ tag });
        await userEvent.clear(screen.getByTestId("field-alias-input"));
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
        dimension: ["field", PEOPLE.NAME, null],
        "widget-type": "string/=",
      });
      const { setTemplateTag } = setup({ tag });

      await userEvent.click(screen.getByTestId("filter-widget-type-select"));
      await userEvent.click(screen.getByText("String"));
      await userEvent.click(screen.getByTestId("filter-widget-type-select"));
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
        dimension: ["field", PEOPLE.NAME, null],
        "widget-type": "string/starts-with",
        options: { "case-sensitive": false },
      });
      const { setTemplateTag } = setup({ tag });

      await userEvent.click(screen.getByTestId("filter-widget-type-select"));
      await userEvent.click(screen.getByText("String starts with"));
      await userEvent.click(screen.getByTestId("filter-widget-type-select"));
      await userEvent.click(screen.getByText("String"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        default: null,
        "widget-type": "string/=",
        options: undefined,
      });
    });

    it("should replace old location widget-type values with string/=", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        dimension: ["field", PEOPLE.NAME, null],
        "widget-type": "location/country",
      });
      setup({ tag });

      await userEvent.click(screen.getByTestId("filter-widget-type-select"));
      expect(screen.getByText("String")).toBeInTheDocument();
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
        dimension: ["field", PEOPLE.SOURCE, null],
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
        dimension: ["field", PEOPLE.CREATED_AT, null],
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

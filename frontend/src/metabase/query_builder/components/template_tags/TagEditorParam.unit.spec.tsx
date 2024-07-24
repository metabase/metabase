import userEvent from "@testing-library/user-event";

import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { TemplateTag } from "metabase-types/api";
import {
  createMockCard,
  createMockNativeDatasetQuery,
  createMockParameter,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS,
  PEOPLE,
  REVIEWS,
} from "metabase-types/api/mocks/presets";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

import { TagEditorParam } from "./TagEditorParam";

interface SetupOpts {
  tag?: TemplateTag;
}

const setup = ({ tag = createMockTemplateTag() }: SetupOpts = {}) => {
  const database = createSampleDatabase();
  const state = createMockState({
    qb: createMockQueryBuilderState({
      card: createMockCard({
        dataset_query: createMockNativeDatasetQuery(),
      }),
    }),
    entities: createMockEntitiesState({
      databases: [database],
    }),
  });

  const metadata = getMetadata(state);

  const databaseMetadata = checkNotNull(metadata.database(database.id));

  setupDatabasesEndpoints([database]);
  setupSearchEndpoints([]);

  const setTemplateTag = jest.fn();
  const setTemplateTagConfig = jest.fn();
  const setParameterValue = jest.fn();

  renderWithProviders(
    <TagEditorParam
      tag={tag}
      database={databaseMetadata}
      databases={metadata.databasesList()}
      parameter={createMockParameter()}
      setTemplateTag={setTemplateTag}
      setTemplateTagConfig={setTemplateTagConfig}
      setParameterValue={setParameterValue}
    />,
    { storeInitialState: state },
  );

  return { setTemplateTag, setTemplateTagConfig, setParameterValue };
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

      await userEvent.click(screen.getByText("People"));
      await userEvent.click(await screen.findByText("Source"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        dimension: ["field", PEOPLE.SOURCE, null],
        "widget-type": "string/=",
        options: undefined,
      });
    });

    it("should default to string/contains for a new high cardinality string field filter", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        dimension: undefined,
        "widget-type": undefined,
      });
      const { setTemplateTag } = setup({ tag });

      await waitForElementsToLoad("People");

      await userEvent.click(screen.getByText("People"));
      await userEvent.click(await screen.findByText("Name"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        dimension: ["field", PEOPLE.NAME, null],
        "widget-type": "string/contains",
        options: { "case-sensitive": false },
      });
    });

    it("should default to number/= for a new numeric field filter", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        dimension: undefined,
        "widget-type": undefined,
      });
      const { setTemplateTag } = setup({ tag });

      await waitForElementsToLoad("Orders");

      await userEvent.click(screen.getByText("Orders"));
      await userEvent.click(await screen.findByText("Quantity"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        dimension: ["field", ORDERS.QUANTITY, null],
        "widget-type": "number/=",
        options: undefined,
      });
    });

    it("should default to number/= for a new reviews->rating field filter (metabase#16151)", async () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        dimension: undefined,
        "widget-type": undefined,
      });
      const { setTemplateTag } = setup({ tag });

      await waitForElementsToLoad("Reviews");

      await userEvent.click(screen.getByText("Reviews"));
      await userEvent.click(await screen.findByText("Rating"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        dimension: ["field", REVIEWS.RATING, null],
        "widget-type": "number/=",
        options: undefined,
      });
    });

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
    });
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
});

async function waitForElementsToLoad(text: string) {
  await waitFor(
    () => {
      expect(screen.getByText(text)).toBeInTheDocument();
    },
    { timeout: 10000 },
  );
}

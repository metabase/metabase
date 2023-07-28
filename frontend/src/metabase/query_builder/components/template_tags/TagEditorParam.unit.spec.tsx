import userEvent from "@testing-library/user-event";
import { getMetadata } from "metabase/selectors/metadata";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { TemplateTag } from "metabase-types/api";
import {
  createMockCard,
  createMockNativeDatasetQuery,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS,
  PEOPLE,
} from "metabase-types/api/mocks/presets";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";
import TagEditorParam from "./TagEditorParam";

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

  setupDatabasesEndpoints([database]);
  setupSearchEndpoints([]);

  const setTemplateTag = jest.fn();
  const setTemplateTagConfig = jest.fn();
  const setParameterValue = jest.fn();

  renderWithProviders(
    <TagEditorParam
      tag={tag}
      database={metadata.database(database.id)}
      databases={metadata.databasesList()}
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
      userEvent.clear(input);
      userEvent.type(input, "New");
      userEvent.tab();

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        "display-name": "New",
      });
    });
  });

  describe("tag type", () => {
    it("should be able to change the type of the tag", () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        dimension: ["field", PEOPLE.NAME, null],
        "widget-type": "string/starts-with",
      });
      const { setTemplateTag } = setup({ tag });

      userEvent.click(screen.getByText("Field Filter"));
      userEvent.click(screen.getByText("Number"));

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

      userEvent.click(await screen.findByText("People"));
      userEvent.click(await screen.findByText("Source"));

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

      userEvent.click(await screen.findByText("People"));
      userEvent.click(await screen.findByText("Name"));

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

      userEvent.click(await screen.findByText("Orders"));
      userEvent.click(await screen.findByText("Quantity"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        dimension: ["field", ORDERS.QUANTITY, null],
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

      userEvent.click(await screen.findByText("Name"));
      userEvent.click(await screen.findByText("Address"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        dimension: ["field", PEOPLE.ADDRESS, null],
      });
    });
  });

  describe("tag widget type", () => {
    it("should be able to set the widget type with options", () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        dimension: ["field", PEOPLE.NAME, null],
        "widget-type": "string/=",
      });
      const { setTemplateTag } = setup({ tag });

      userEvent.click(screen.getByText("String"));
      userEvent.click(screen.getByText("String contains"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        "widget-type": "string/contains",
        options: { "case-sensitive": false },
      });
    });

    it("should be able to set the widget type without options", () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        dimension: ["field", PEOPLE.NAME, null],
        "widget-type": "string/starts-with",
        options: { "case-sensitive": false },
      });
      const { setTemplateTag } = setup({ tag });

      userEvent.click(screen.getByText("String starts with"));
      userEvent.click(screen.getByText("String"));

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        "widget-type": "string/=",
        options: undefined,
      });
    });

    it("should replace old location widget-type values with string/=", () => {
      const tag = createMockTemplateTag({
        type: "dimension",
        dimension: ["field", PEOPLE.NAME, null],
        "widget-type": "location/country",
      });
      setup({ tag });

      expect(screen.getByText("String")).toBeInTheDocument();
    });
  });

  describe("tag required", () => {
    it("should be able to make the tag required", () => {
      const tag = createMockTemplateTag();
      const { setTemplateTag } = setup({ tag });

      const toggle = screen.getByRole("switch", { name: "Required?" });
      userEvent.click(toggle);

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        required: true,
      });
    });

    it("should clear the default value when becoming not required", () => {
      const tag = createMockTemplateTag({ required: true, default: "abc" });
      const { setTemplateTag } = setup({ tag });

      const toggle = screen.getByRole("switch", { name: "Required?" });
      userEvent.click(toggle);

      expect(setTemplateTag).toHaveBeenCalledWith({
        ...tag,
        required: false,
        default: undefined,
      });
    });
  });
});

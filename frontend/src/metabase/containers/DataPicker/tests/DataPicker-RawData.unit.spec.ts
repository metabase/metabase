import userEvent from "@testing-library/user-event";

import { screen, waitForLoaderToBeRemoved } from "__support__/ui";
import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";

import {
  setup,
  SAMPLE_DATABASE,
  EMPTY_DATABASE,
  MULTI_SCHEMA_DATABASE,
  SAMPLE_TABLE,
  SAMPLE_TABLE_2,
  SAMPLE_TABLE_3,
  SAMPLE_TABLE_4,
} from "./common";

describe("DataPicker — picking raw data", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  it("opens the picker", async () => {
    await setup();

    await userEvent.click(screen.getByText(/Raw Data/i));
    await waitForLoaderToBeRemoved();

    expect(screen.getByText(SAMPLE_DATABASE.name)).toBeInTheDocument();
    SAMPLE_DATABASE.tables?.forEach(table => {
      expect(screen.getByText(table.display_name)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Models/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saved Questions/i)).not.toBeInTheDocument();
  });

  it("has empty state", async () => {
    await setup({ hasEmptyDatabase: true });

    await userEvent.click(screen.getByText(/Raw Data/i));
    await userEvent.click(screen.getByText(EMPTY_DATABASE.name));

    expect(await screen.findByText(/Nothing here/i)).toBeInTheDocument();
  });

  it("doesn't show saved questions database", async () => {
    await setup();
    await userEvent.click(screen.getByText("Raw Data"));
    expect(screen.queryByText(/Saved Questions/i)).not.toBeInTheDocument();
  });

  it("allows to pick multiple tables", async () => {
    const { onChange } = await setup({ isMultiSelect: true });

    await userEvent.click(screen.getByText(/Raw Data/i));
    await userEvent.click(await screen.findByText(SAMPLE_TABLE.display_name));
    await userEvent.click(screen.getByText(SAMPLE_TABLE_2.display_name));

    expect(onChange).toHaveBeenLastCalledWith({
      type: "raw-data",
      databaseId: SAMPLE_DATABASE.id,
      schemaId: generateSchemaId(SAMPLE_DATABASE.id, SAMPLE_TABLE.schema),
      tableIds: [SAMPLE_TABLE.id, SAMPLE_TABLE_2.id],
    });
  });

  it("allows to return to the data type picker", async () => {
    await setup();

    await userEvent.click(screen.getByText(/Raw Data/i));
    await waitForLoaderToBeRemoved();
    await userEvent.click(screen.getByRole("button", { name: /Back/i }));

    expect(screen.getByText(/Models/i)).toBeInTheDocument();
    expect(screen.getByText(/Raw Data/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved Questions/i)).toBeInTheDocument();

    expect(screen.queryByText(SAMPLE_DATABASE.name)).not.toBeInTheDocument();
    SAMPLE_DATABASE.tables?.forEach(table => {
      expect(screen.queryByText(table.display_name)).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /Back/i }),
    ).not.toBeInTheDocument();
  });

  it("allows to pick a single table", async () => {
    const { onChange } = await setup();

    await userEvent.click(screen.getByText(/Raw Data/i));
    await userEvent.click(await screen.findByText(SAMPLE_TABLE.display_name));
    await userEvent.click(screen.getByText(SAMPLE_TABLE_2.display_name));

    const selectedItem = screen.getByRole("menuitem", {
      name: SAMPLE_TABLE_2.display_name,
    });
    expect(selectedItem).toHaveAttribute("aria-selected", "true");
    expect(onChange).toHaveBeenCalledWith({
      type: "raw-data",
      databaseId: SAMPLE_DATABASE.id,
      schemaId: generateSchemaId(SAMPLE_DATABASE.id, SAMPLE_TABLE_2.schema),
      tableIds: [SAMPLE_TABLE_2.id],
    });
  });

  describe("given a single-schema database", () => {
    it("respects initial value", async () => {
      await setup({
        initialValue: {
          type: "raw-data",
          databaseId: SAMPLE_DATABASE.id,
          schemaId: generateSchemaId(SAMPLE_DATABASE.id, SAMPLE_TABLE.schema),
          tableIds: [SAMPLE_TABLE.id],
        },
        filters: {
          types: type => type === "raw-data",
        },
      });

      const tableListItem = await screen.findByRole("menuitem", {
        name: SAMPLE_TABLE.display_name,
      });
      const databaseListItem = screen.getByRole("menuitem", {
        name: SAMPLE_DATABASE.name,
      });

      expect(tableListItem).toHaveAttribute("aria-selected", "true");
      expect(databaseListItem).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("given a multiple-schema database", () => {
    it("respects initial value", async () => {
      const table = SAMPLE_TABLE_3;
      const schema = table.schema;

      await setup({
        hasMultiSchemaDatabase: true,
        initialValue: {
          type: "raw-data",
          databaseId: MULTI_SCHEMA_DATABASE.id,
          schemaId: generateSchemaId(MULTI_SCHEMA_DATABASE.id, schema),
          tableIds: [table.id],
        },
      });

      const schemaListItem = await screen.findByRole("menuitem", {
        name: schema,
      });
      const tableListItem = await screen.findByRole("menuitem", {
        name: table.display_name,
      });
      const databaseListItem = screen.getByRole("menuitem", {
        name: MULTI_SCHEMA_DATABASE.name,
      });

      expect(schemaListItem).toHaveAttribute("aria-selected", "true");
      expect(databaseListItem).toHaveAttribute("aria-selected", "false");
      expect(tableListItem).toHaveAttribute("aria-selected", "true");
    });

    it("resets selected tables on schema change", async () => {
      const schema1Table = SAMPLE_TABLE_3;
      const schema1 = SAMPLE_TABLE_3.schema;
      const schema2 = SAMPLE_TABLE_4.schema;

      const { onChange } = await setup({ hasMultiSchemaDatabase: true });

      await userEvent.click(screen.getByText(/Raw Data/i));
      await userEvent.click(screen.getByText(MULTI_SCHEMA_DATABASE.name));
      await userEvent.click(await screen.findByText(schema1));
      await userEvent.click(await screen.findByText(schema1Table.display_name));
      await userEvent.click(await screen.findByText(schema2));

      expect(onChange).toHaveBeenLastCalledWith({
        type: "raw-data",
        databaseId: MULTI_SCHEMA_DATABASE.id,
        schemaId: generateSchemaId(MULTI_SCHEMA_DATABASE.id, schema2),
        tableIds: [],
      });
    });
  });

  describe("given many databases", () => {
    it("resets selected tables on database change", async () => {
      const { onChange } = await setup({ hasMultiSchemaDatabase: true });

      await userEvent.click(screen.getByText(/Raw Data/i));
      await userEvent.click(screen.getByText(SAMPLE_DATABASE.name));
      await userEvent.click(await screen.findByText(SAMPLE_TABLE.display_name));
      await userEvent.click(screen.getByText(MULTI_SCHEMA_DATABASE.name));

      expect(onChange).toHaveBeenLastCalledWith({
        type: "raw-data",
        databaseId: MULTI_SCHEMA_DATABASE.id,
        schemaId: undefined,
        tableIds: [],
      });
    });
  });

  it("resets selection when going back to data type picker", async () => {
    const { onChange } = await setup();

    await userEvent.click(screen.getByText(/Raw Data/i));
    await userEvent.click(await screen.findByText(SAMPLE_TABLE.display_name));
    await userEvent.click(screen.getByRole("button", { name: /Back/i }));

    expect(onChange).toHaveBeenLastCalledWith({
      type: undefined,
      databaseId: undefined,
      schemaId: undefined,
      collectionId: undefined,
      tableIds: [],
    });
  });
});

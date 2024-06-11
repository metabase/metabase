import userEvent from "@testing-library/user-event";

import { setupSchemaEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Database } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import type { UploadsSettings } from "metabase-types/api/settings";
import { createMockState } from "metabase-types/store/mocks";

import { UploadSettingsFormView } from "./UploadSettingsForm";

const TEST_DATABASES = [
  createMockDatabase({
    id: 1,
    name: "Db Uno",
    engine: "postgres",
    settings: { "database-enable-actions": true },
    tables: [
      // we need to mock these tables so that it mocks the schema endpoint
      createMockTable({ schema: "public" }),
      createMockTable({ schema: "uploads" }),
      createMockTable({ schema: "top_secret" }),
    ],
    features: ["schemas"],
  }),
  createMockDatabase({
    id: 2,
    name: "Db Dos",
    engine: "mysql",
    settings: { "database-enable-actions": true },
  }),
  createMockDatabase({
    id: 3,
    name: "Db Tres",
    engine: "h2",
    settings: { "database-enable-actions": true },
    tables: [createMockTable({ schema: "public" })],
    features: ["schemas"],
  }),
  createMockDatabase({
    id: 5,
    name: "Db Cinco",
    engine: "h2",
    settings: { "database-enable-actions": true },
    tables: [],
    features: ["schemas"],
  }),
];

interface SetupOpts {
  databases?: Database[];
  uploadsSettings?: UploadsSettings;
}

function setup({
  databases = TEST_DATABASES,
  uploadsSettings = {
    db_id: null,
    schema_name: null,
    table_prefix: null,
  },
}: SetupOpts = {}) {
  const state = createMockState({
    entities: createMockEntitiesState({ databases }),
  });
  const metadata = getMetadata(state);

  databases.forEach(db => {
    setupSchemaEndpoints(db);
  });

  const updateSpy = jest.fn(() => Promise.resolve());
  const savingSpy = jest.fn();
  const savedSpy = jest.fn();
  const clearSpy = jest.fn();

  renderWithProviders(
    <UploadSettingsFormView
      databases={databases.map(({ id }) => checkNotNull(metadata.database(id)))}
      uploadsSettings={uploadsSettings}
      updateSettings={updateSpy}
      saveStatusRef={{
        current: {
          setSaving: savingSpy,
          setSaved: savedSpy,
          clear: clearSpy,
        } as any,
      }}
    />,
    { storeInitialState: {} },
  );
  return { updateSpy, savingSpy, savedSpy, clearSpy };
}

describe("Admin > Settings > UploadSetting", () => {
  it("should render a description", async () => {
    setup();
    expect(
      screen.getByText("Allow people to upload data to Collections"),
    ).toBeInTheDocument();
  });

  it("should show an empty state if there are no databases", async () => {
    setup({ databases: [] });
    expect(
      screen.getByText(
        "None of your databases are compatible with this version of the uploads feature.",
      ),
    ).toBeInTheDocument();
  });

  it("should populate a dropdown of actions-enabled DBs", async () => {
    setup();
    await userEvent.click(await screen.findByText("Select a database"));

    expect(await screen.findByText("Db Uno")).toBeInTheDocument();
    expect(await screen.findByText("Db Dos")).toBeInTheDocument();
    expect(await screen.findByText("Db Tres")).toBeInTheDocument();
    expect(await screen.findByText("Db Cinco")).toBeInTheDocument();
  });

  it("should populate a dropdown of schema for schema-enabled DBs", async () => {
    setup();
    await userEvent.click(await screen.findByText("Select a database"));

    const dbItem = await screen.findByText("Db Uno");
    await userEvent.click(dbItem);

    const schemaDropdown = await screen.findByText("Select a schema");
    await userEvent.click(schemaDropdown);

    expect(await screen.findByText("public")).toBeInTheDocument();
    expect(await screen.findByText("uploads")).toBeInTheDocument();
    expect(await screen.findByText("top_secret")).toBeInTheDocument();
  });

  it("should be able to submit a db + schema combination selection", async () => {
    const { updateSpy } = setup();
    await userEvent.click(await screen.findByText("Select a database"));

    const dbItem = await screen.findByText("Db Uno");
    await userEvent.click(dbItem);

    const schemaDropdown = await screen.findByText("Select a schema");
    await userEvent.click(schemaDropdown);

    const schemaItem = await screen.findByText("uploads");

    await userEvent.click(schemaItem);

    await userEvent.click(
      await screen.findByRole("button", { name: "Enable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      "uploads-settings": {
        db_id: 1,
        schema_name: "uploads",
        table_prefix: null,
      },
    });
  });

  it("should be able to submit a table prefix for databases without schema", async () => {
    const { updateSpy } = setup();
    await userEvent.click(await screen.findByText("Select a database"));

    const dbItem = await screen.findByText("Db Dos");
    await userEvent.click(dbItem);

    const prefixInput = await screen.findByPlaceholderText("upload_");

    await userEvent.clear(prefixInput);
    await userEvent.type(prefixInput, "my_prefix_");

    await userEvent.click(
      await screen.findByRole("button", { name: "Enable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      "uploads-settings": {
        db_id: 2,
        schema_name: null,
        table_prefix: "my_prefix_",
      },
    });
  });

  it("should be able to submit a table prefix for databases with schema", async () => {
    const { updateSpy } = setup();
    await userEvent.click(await screen.findByText("Select a database"));

    const dbItem = await screen.findByText("Db Uno");
    await userEvent.click(dbItem);

    const schemaDropdown = await screen.findByText("Select a schema");
    await userEvent.click(schemaDropdown);

    const schemaItem = await screen.findByText("uploads");
    await userEvent.click(schemaItem);

    const prefixInput = await screen.findByPlaceholderText("upload_");
    await userEvent.clear(prefixInput);
    await userEvent.type(prefixInput, "my_prefix_");

    await userEvent.click(
      await screen.findByRole("button", { name: "Enable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      "uploads-settings": {
        db_id: 1,
        schema_name: "uploads",
        table_prefix: "my_prefix_",
      },
    });
  });

  it("should call update methods on saveStatusRef", async () => {
    const { savingSpy, savedSpy } = setup();
    await userEvent.click(await screen.findByText("Select a database"));

    const dbItem = await screen.findByText("Db Dos");
    await userEvent.click(dbItem);

    const prefixInput = await screen.findByPlaceholderText("upload_");

    await userEvent.clear(prefixInput);
    await userEvent.type(prefixInput, "my_prefix_");

    await userEvent.click(
      await screen.findByRole("button", { name: "Enable uploads" }),
    );

    expect(savingSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(savedSpy).toHaveBeenCalledTimes(1));
  });

  it("should show an error if enabling fails", async () => {
    const { updateSpy } = setup();
    updateSpy.mockImplementation(() => Promise.reject(new Error("Oh no!")));
    await userEvent.click(await screen.findByText("Select a database"));

    const dbItem = await screen.findByText("Db Dos");
    await userEvent.click(dbItem);

    await userEvent.click(
      await screen.findByRole("button", { name: "Enable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      "uploads-settings": {
        db_id: 2,
        schema_name: null,
        table_prefix: "upload_",
      },
    });

    expect(await screen.findByText(/There was a problem/i)).toBeInTheDocument();
  });

  it("should be able to disable uploads", async () => {
    const { updateSpy } = setup({
      uploadsSettings: {
        db_id: 2,
        schema_name: null,
        table_prefix: null,
      },
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Disable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      "uploads-settings": {
        db_id: null,
        schema_name: null,
        table_prefix: null,
      },
    });
  });

  it("should show an error if disabling fails", async () => {
    const { updateSpy, savingSpy, clearSpy, savedSpy } = setup({
      uploadsSettings: {
        db_id: 2,
        schema_name: null,
        table_prefix: null,
      },
    });
    updateSpy.mockImplementation(() => Promise.reject(new Error("Oh no!")));
    await userEvent.click(
      await screen.findByRole("button", { name: "Disable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      "uploads-settings": {
        db_id: null,
        schema_name: null,
        table_prefix: null,
      },
    });

    expect(await screen.findByText(/There was a problem/i)).toBeInTheDocument();
    expect(savingSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(savedSpy).not.toHaveBeenCalled();
  });

  it("should populate db and schema from existing settings", async () => {
    setup({
      uploadsSettings: {
        db_id: 1,
        schema_name: "top_secret",
        table_prefix: null,
      },
    });

    expect(await screen.findByText("Db Uno")).toBeInTheDocument();
    expect(await screen.findByText("top_secret")).toBeInTheDocument();
  });

  it("should populate db and stable prefix from existing settings", async () => {
    setup({
      uploadsSettings: {
        db_id: 2,
        schema_name: null,
        table_prefix: "my_uploads_",
      },
    });

    expect(await screen.findByText("Db Dos")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("my_uploads_")).toBeInTheDocument();
  });

  it("should show a message if there are no schema for the selected db", async () => {
    setup({
      uploadsSettings: {
        db_id: null,
        schema_name: null,
        table_prefix: null,
      },
    });
    const dbItem = await screen.findByText("Select a database");
    await userEvent.click(dbItem);
    await userEvent.click(await screen.findByText("Db Cinco"));

    expect(
      await screen.findByText(/We couldn't find any schema/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Enable uploads" }),
    ).toBeDisabled();
  });

  it("should be able to update db settings", async () => {
    const { updateSpy } = setup({
      uploadsSettings: {
        db_id: 2,
        schema_name: null,
        table_prefix: null,
      },
    });
    await userEvent.click(await screen.findByText("Db Dos"));

    const dbItem = await screen.findByText("Db Uno");
    await userEvent.click(dbItem);

    expect(
      screen.queryByRole("button", { name: "Enable uploads" }),
    ).not.toBeInTheDocument();
    const updateButton = await screen.findByRole("button", {
      name: "Update settings",
    });
    expect(updateButton).toBeInTheDocument();
    expect(updateButton).toBeDisabled(); // because no schema is selected

    const schemaDropdown = await screen.findByText("Select a schema");
    await userEvent.click(schemaDropdown);

    const schemaItem = await screen.findByText("uploads");
    await userEvent.click(schemaItem);

    await userEvent.click(
      await screen.findByRole("button", { name: "Update settings" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      "uploads-settings": {
        db_id: 1,
        schema_name: "uploads",
        table_prefix: null,
      },
    });
  });

  describe("button states", () => {
    it("should show disabled enable button when no db is selected", async () => {
      setup();
      expect(
        await screen.findByRole("button", { name: "Enable uploads" }),
      ).toBeDisabled();
    });

    it("should show disabled enable button when no schema is selected", async () => {
      setup();
      await userEvent.click(await screen.findByText("Select a database"));

      const dbItem = await screen.findByText("Db Uno");
      await userEvent.click(dbItem);

      expect(
        await screen.findByRole("button", { name: "Enable uploads" }),
      ).toBeDisabled();
    });

    it("should show enabled disable button when a db is populated", async () => {
      setup({
        uploadsSettings: {
          db_id: 2,
          schema_name: null,
          table_prefix: null,
        },
      });
      expect(
        await screen.findByRole("button", { name: "Disable uploads" }),
      ).toBeEnabled();
    });

    it("should enable the enable button when a schemaless db is selected", async () => {
      setup();
      await userEvent.click(await screen.findByText("Select a database"));

      const dbItem = await screen.findByText("Db Dos");
      await userEvent.click(dbItem);

      expect(
        await screen.findByRole("button", { name: "Enable uploads" }),
      ).toBeEnabled();
    });

    it("should show the only the update button when a db is changed", async () => {
      setup({
        uploadsSettings: {
          db_id: 2,
          schema_name: null,
          table_prefix: null,
        },
      });
      await userEvent.click(await screen.findByText("Db Dos"));

      const dbItem = await screen.findByText("Db Uno");
      await userEvent.click(dbItem);

      expect(
        screen.queryByRole("button", { name: "Enable uploads" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Disable uploads" }),
      ).not.toBeInTheDocument();
      const updateButton = await screen.findByRole("button", {
        name: "Update settings",
      });
      expect(updateButton).toBeInTheDocument();
      expect(updateButton).toBeDisabled(); // because no schema is selected

      const schemaDropdown = await screen.findByText("Select a schema");
      await userEvent.click(schemaDropdown);

      const schemaItem = await screen.findByText("uploads");
      await userEvent.click(schemaItem);

      expect(updateButton).toBeEnabled(); // now that a schema is selected
    });

    it("should show the update button when a table prefix is changed", async () => {
      setup({
        uploadsSettings: {
          db_id: 2,
          schema_name: null,
          table_prefix: "up_",
        },
      });

      const prefixInput = await screen.findByPlaceholderText("upload_");
      await userEvent.clear(prefixInput);
      await userEvent.type(prefixInput, "my_prefix_");

      expect(
        await screen.findByRole("button", { name: "Update settings" }),
      ).toBeEnabled();
    });

    it("should show a loading spinner on submit", async () => {
      const { updateSpy } = setup({
        uploadsSettings: {
          db_id: 2,
          schema_name: null,
          table_prefix: "up_",
        },
      });
      updateSpy.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 500)),
      );

      const prefixInput = await screen.findByPlaceholderText("upload_");
      await userEvent.clear(prefixInput);
      await userEvent.type(prefixInput, "my_prefix_");

      const updateButton = await screen.findByRole("button", {
        name: "Update settings",
      });
      await userEvent.click(updateButton);
      expect(await screen.findByTestId("loading-spinner")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Update settings" }),
      ).not.toBeInTheDocument();
    });

    it("should reset button loading state on input change", async () => {
      const { updateSpy } = setup({
        uploadsSettings: {
          db_id: 2,
          schema_name: null,
          table_prefix: "up_",
        },
      });
      updateSpy.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 500)),
      );

      const prefixInput = await screen.findByPlaceholderText("upload_");
      await userEvent.clear(prefixInput);
      await userEvent.type(prefixInput, "my_prefix_");

      const updateButton = await screen.findByRole("button", {
        name: "Update settings",
      });
      await userEvent.click(updateButton);
      expect(await screen.findByTestId("loading-spinner")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Update settings" }),
      ).not.toBeInTheDocument();

      await userEvent.clear(prefixInput);
      await userEvent.type(prefixInput, "_2");
      expect(
        screen.getByRole("button", { name: "Update settings" }),
      ).toBeInTheDocument();
    });
  });

  it("should show a warning for h2 databases", async () => {
    setup();
    await userEvent.click(await screen.findByText("Select a database"));

    await userEvent.click(await screen.findByText("Db Cinco")); // h2

    expect(
      screen.getByText(/uploads to the Sample Database are for testing only/i),
    ).toBeInTheDocument();
  });
});

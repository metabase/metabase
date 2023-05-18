import React from "react";
import userEvent from "@testing-library/user-event";

import { checkNotNull } from "metabase/core/utils/types";
import { getMetadata } from "metabase/selectors/metadata";
import { Database } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { setupSchemaEndpoints } from "__support__/server-mocks";

import { UploadSettingsView, UploadSettings } from "./UploadSettings";

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
    id: 4,
    name: "Db Cuatro",
    engine: "mongo",
    settings: { "database-enable-actions": false },
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
  settings?: UploadSettings;
}

function setup({
  databases = TEST_DATABASES,
  settings = {
    uploads_enabled: false,
    uploads_database_id: null,
    uploads_schema_name: null,
    uploads_table_prefix: null,
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
    <UploadSettingsView
      databases={databases.map(({ id }) => checkNotNull(metadata.database(id)))}
      settings={settings}
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
      screen.getByText("Allow users to upload data to Collections"),
    ).toBeInTheDocument();
  });

  it("should show an empty state if there are no actions-enabled databases", async () => {
    setup({ databases: [TEST_DATABASES[3]] });
    expect(
      screen.getByText("No actions-enabled databases available."),
    ).toBeInTheDocument();
  });

  it("should populate a dropdown of actions-enabled DBs", async () => {
    setup();
    userEvent.click(await screen.findByText("Select a database"));

    expect(await screen.findByText("Db Uno")).toBeInTheDocument();
    expect(await screen.findByText("Db Dos")).toBeInTheDocument();
    expect(await screen.findByText("Db Tres")).toBeInTheDocument();
    expect(screen.queryByText("Db Cuatro")).not.toBeInTheDocument();
  });

  it("should populate a dropdown of schema for schema-enabled DBs", async () => {
    setup();
    userEvent.click(await screen.findByText("Select a database"));

    const dbItem = await screen.findByText("Db Uno");
    userEvent.click(dbItem);

    const schemaDropdown = await screen.findByText("Select a schema");
    userEvent.click(schemaDropdown);

    expect(await screen.findByText("public")).toBeInTheDocument();
    expect(await screen.findByText("uploads")).toBeInTheDocument();
    expect(await screen.findByText("top_secret")).toBeInTheDocument();
  });

  it("should be able to submit a db + schema combination selection", async () => {
    const { updateSpy } = setup();
    userEvent.click(await screen.findByText("Select a database"));

    const dbItem = await screen.findByText("Db Uno");
    userEvent.click(dbItem);

    const schemaDropdown = await screen.findByText("Select a schema");
    userEvent.click(schemaDropdown);

    const schemaItem = await screen.findByText("uploads");

    userEvent.click(schemaItem);

    userEvent.click(
      await screen.findByRole("button", { name: "Enable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      "uploads-enabled": true,
      "uploads-database-id": 1,
      "uploads-schema-name": "uploads",
      "uploads-table-prefix": null,
    });
  });

  it("should be able to submit a table prefix for databases without schema", async () => {
    const { updateSpy } = setup();
    userEvent.click(await screen.findByText("Select a database"));

    const dbItem = await screen.findByText("Db Dos");
    userEvent.click(dbItem);

    const prefixInput = await screen.findByPlaceholderText("uploaded_");

    userEvent.type(prefixInput, "my_prefix_");

    userEvent.click(
      await screen.findByRole("button", { name: "Enable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      "uploads-enabled": true,
      "uploads-database-id": 2,
      "uploads-schema-name": null,
      "uploads-table-prefix": "my_prefix_",
    });
  });

  it("should call update methods on saveStatusRef", async () => {
    const { savingSpy, savedSpy } = setup();
    userEvent.click(await screen.findByText("Select a database"));

    const dbItem = await screen.findByText("Db Dos");
    userEvent.click(dbItem);

    const prefixInput = await screen.findByPlaceholderText("uploaded_");

    userEvent.type(prefixInput, "my_prefix_");

    userEvent.click(
      await screen.findByRole("button", { name: "Enable uploads" }),
    );

    expect(savingSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(savedSpy).toHaveBeenCalledTimes(1));
  });

  it("should show an error if enabling fails", async () => {
    const { updateSpy } = setup();
    updateSpy.mockImplementation(() => Promise.reject(new Error("Oh no!")));
    userEvent.click(await screen.findByText("Select a database"));

    const dbItem = await screen.findByText("Db Dos");
    userEvent.click(dbItem);

    userEvent.click(
      await screen.findByRole("button", { name: "Enable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      "uploads-enabled": true,
      "uploads-database-id": 2,
      "uploads-schema-name": null,
      "uploads-table-prefix": null,
    });

    expect(await screen.findByText(/There was a problem/i)).toBeInTheDocument();
  });

  it("should be able to disable uploads", async () => {
    const { updateSpy } = setup({
      settings: {
        uploads_enabled: true,
        uploads_database_id: 2,
        uploads_schema_name: null,
        uploads_table_prefix: null,
      },
    });
    userEvent.click(
      await screen.findByRole("button", { name: "Disable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      "uploads-enabled": false,
      "uploads-database-id": null,
      "uploads-schema-name": null,
      "uploads-table-prefix": null,
    });
  });

  it("should show an error if disabling fails", async () => {
    const { updateSpy, savingSpy, clearSpy, savedSpy } = setup({
      settings: {
        uploads_enabled: true,
        uploads_database_id: 2,
        uploads_schema_name: null,
        uploads_table_prefix: null,
      },
    });
    updateSpy.mockImplementation(() => Promise.reject(new Error("Oh no!")));
    userEvent.click(
      await screen.findByRole("button", { name: "Disable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      "uploads-enabled": false,
      "uploads-database-id": null,
      "uploads-schema-name": null,
      "uploads-table-prefix": null,
    });

    expect(await screen.findByText(/There was a problem/i)).toBeInTheDocument();
    expect(savingSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(savedSpy).not.toHaveBeenCalled();
  });

  it("should populate db and schema from existing settings", async () => {
    setup({
      settings: {
        uploads_enabled: true,
        uploads_database_id: 1,
        uploads_schema_name: "top_secret",
        uploads_table_prefix: null,
      },
    });

    expect(await screen.findByText("Db Uno")).toBeInTheDocument();
    expect(await screen.findByText("top_secret")).toBeInTheDocument();
  });

  it("should populate db and stable prefix from existing settings", async () => {
    setup({
      settings: {
        uploads_enabled: true,
        uploads_database_id: 2,
        uploads_schema_name: null,
        uploads_table_prefix: "my_uploads_",
      },
    });

    expect(await screen.findByText("Db Dos")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("my_uploads_")).toBeInTheDocument();
  });

  it("should show a message if there are no schema for the selected db", async () => {
    setup({
      settings: {
        uploads_enabled: false,
        uploads_database_id: 5,
        uploads_schema_name: null,
        uploads_table_prefix: null,
      },
    });

    expect(
      await screen.findByText(/We couldn't find any schema/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Enable uploads" }),
    ).toBeDisabled();
  });

  it("should be able to update db settings", async () => {
    const { updateSpy } = setup({
      settings: {
        uploads_enabled: true,
        uploads_database_id: 2,
        uploads_schema_name: null,
        uploads_table_prefix: null,
      },
    });
    userEvent.click(await screen.findByText("Db Dos"));

    const dbItem = await screen.findByText("Db Uno");
    userEvent.click(dbItem);

    expect(
      screen.queryByRole("button", { name: "Enable uploads" }),
    ).not.toBeInTheDocument();
    const updateButton = await screen.findByRole("button", {
      name: "Update settings",
    });
    expect(updateButton).toBeInTheDocument();
    expect(updateButton).toBeDisabled(); // because no schema is selected

    const schemaDropdown = await screen.findByText("Select a schema");
    userEvent.click(schemaDropdown);

    const schemaItem = await screen.findByText("uploads");
    userEvent.click(schemaItem);

    userEvent.click(
      await screen.findByRole("button", { name: "Update settings" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      "uploads-enabled": true,
      "uploads-database-id": 1,
      "uploads-schema-name": "uploads",
      "uploads-table-prefix": null,
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
      userEvent.click(await screen.findByText("Select a database"));

      const dbItem = await screen.findByText("Db Uno");
      userEvent.click(dbItem);

      expect(
        await screen.findByRole("button", { name: "Enable uploads" }),
      ).toBeDisabled();
    });

    it("should show enabled disable button when a db is populated", async () => {
      setup({
        settings: {
          uploads_enabled: true,
          uploads_database_id: 2,
          uploads_schema_name: null,
          uploads_table_prefix: null,
        },
      });
      expect(
        await screen.findByRole("button", { name: "Disable uploads" }),
      ).toBeEnabled();
    });

    it("should enable the enable button when a schemaless db is selected", async () => {
      setup();
      userEvent.click(await screen.findByText("Select a database"));

      const dbItem = await screen.findByText("Db Dos");
      userEvent.click(dbItem);

      expect(
        await screen.findByRole("button", { name: "Enable uploads" }),
      ).toBeEnabled();
    });

    it("should show the only the update button when a db is changed", async () => {
      setup({
        settings: {
          uploads_enabled: true,
          uploads_database_id: 2,
          uploads_schema_name: null,
          uploads_table_prefix: null,
        },
      });
      userEvent.click(await screen.findByText("Db Dos"));

      const dbItem = await screen.findByText("Db Uno");
      userEvent.click(dbItem);

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
      userEvent.click(schemaDropdown);

      const schemaItem = await screen.findByText("uploads");
      userEvent.click(schemaItem);

      expect(updateButton).toBeEnabled(); // now that a schema is selected
    });

    it("should show the update button when a table prefix is changed", async () => {
      setup({
        settings: {
          uploads_enabled: true,
          uploads_database_id: 2,
          uploads_schema_name: null,
          uploads_table_prefix: "up_",
        },
      });

      const prefixInput = await screen.findByPlaceholderText("uploaded_");
      userEvent.clear(prefixInput);
      userEvent.type(prefixInput, "my_prefix_");

      expect(
        await screen.findByRole("button", { name: "Update settings" }),
      ).toBeEnabled();
    });

    it("should show a loading spinner on submit", async () => {
      const { updateSpy } = setup({
        settings: {
          uploads_enabled: true,
          uploads_database_id: 2,
          uploads_schema_name: null,
          uploads_table_prefix: "up_",
        },
      });
      updateSpy.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 500)),
      );

      const prefixInput = await screen.findByPlaceholderText("uploaded_");
      userEvent.clear(prefixInput);
      userEvent.type(prefixInput, "my_prefix_");

      const updateButton = await screen.findByRole("button", {
        name: "Update settings",
      });
      userEvent.click(updateButton);
      expect(await screen.findByTestId("loading-spinner")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Update settings" }),
      ).not.toBeInTheDocument();
    });

    it("should reset button loading state on input change", async () => {
      const { updateSpy } = setup({
        settings: {
          uploads_enabled: true,
          uploads_database_id: 2,
          uploads_schema_name: null,
          uploads_table_prefix: "up_",
        },
      });
      updateSpy.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 500)),
      );

      const prefixInput = await screen.findByPlaceholderText("uploaded_");
      userEvent.clear(prefixInput);
      userEvent.type(prefixInput, "my_prefix_");

      const updateButton = await screen.findByRole("button", {
        name: "Update settings",
      });
      userEvent.click(updateButton);
      expect(await screen.findByTestId("loading-spinner")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Update settings" }),
      ).not.toBeInTheDocument();

      userEvent.type(prefixInput, "_2");
      expect(
        screen.getByRole("button", { name: "Update settings" }),
      ).toBeInTheDocument();
    });
  });
});

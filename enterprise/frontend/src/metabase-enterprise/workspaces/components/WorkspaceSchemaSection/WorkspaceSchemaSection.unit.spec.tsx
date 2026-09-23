import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockDatabase } from "metabase-types/api/mocks";

import { WORKSPACES_SCHEMA_SETTING } from "../../constants";

import { WorkspaceSchemaSection } from "./WorkspaceSchemaSection";

const setup = ({ schema = null }: { schema?: string | null } = {}) => {
  const database = createMockDatabase({
    settings: { [WORKSPACES_SCHEMA_SETTING]: schema },
  });

  fetchMock.get(`path:/api/database/${database.id}/syncable_schemas`, [
    "public",
    "workspace",
  ]);
  fetchMock.put(`path:/api/database/${database.id}`, database);

  renderWithProviders(<WorkspaceSchemaSection database={database} />);

  return { database };
};

describe("WorkspaceSchemaSection", () => {
  it("writes the schema the admin picks to the database's setting", async () => {
    const { database } = setup();

    await userEvent.click(
      await screen.findByPlaceholderText("Select a schema"),
    );
    await userEvent.click(await screen.findByText("workspace"));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(`path:/api/database/${database.id}`),
      ).toBe(true);
    });
    const call = fetchMock.callHistory.lastCall(
      `path:/api/database/${database.id}`,
    );
    expect(JSON.parse(String(call?.options?.body))).toEqual({
      settings: { [WORKSPACES_SCHEMA_SETTING]: "workspace" },
    });
  });

  it("clears the setting when the schema is cleared", async () => {
    const { database } = setup({ schema: "workspace" });

    await userEvent.click(await screen.findByLabelText("Clear"));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(`path:/api/database/${database.id}`),
      ).toBe(true);
    });
    const call = fetchMock.callHistory.lastCall(
      `path:/api/database/${database.id}`,
    );
    expect(JSON.parse(String(call?.options?.body))).toEqual({
      settings: { [WORKSPACES_SCHEMA_SETTING]: null },
    });
  });
});

import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupStatefulSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { setupOAuthClientsEndpoint } from "__support__/server-mocks/oauth";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { OAuthClientSummary } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { McpOAuthSettings } from "./McpOAuthSettings";

const CLIENTS: OAuthClientSummary[] = [
  { client_id: "codex-one", client_name: "Codex" },
  { client_id: "codex-two", client_name: "Codex" },
  { client_id: "claude", client_name: "Claude" },
];

function setup({
  selectedIds = [],
  rotationEnabled = true,
  clients = CLIENTS,
  setByEnvironment = false,
  clientsError = false,
  saveError = false,
}: {
  selectedIds?: string[];
  rotationEnabled?: boolean;
  clients?: OAuthClientSummary[];
  setByEnvironment?: boolean;
  clientsError?: boolean;
  saveError?: boolean;
} = {}) {
  const settings = createMockSettings({
    "oauth-server-rotate-refresh-tokens": rotationEnabled,
    "oauth-server-refresh-token-reuse-client-ids": selectedIds,
  });
  setupPropertiesEndpoints(settings);
  setupStatefulSettingsEndpoints(settings);
  setupSettingsEndpoints(
    setByEnvironment
      ? [
          createMockSettingDefinition({
            key: "oauth-server-refresh-token-reuse-client-ids",
            value: selectedIds,
            is_env_setting: true,
            env_name: "MB_OAUTH_SERVER_REFRESH_TOKEN_REUSE_CLIENT_IDS",
          }),
        ]
      : [],
  );
  if (clientsError) {
    fetchMock.get("path:/api/oauth/clients", {
      status: 500,
      body: { message: "Unable to load clients" },
    });
  } else {
    setupOAuthClientsEndpoint(clients);
  }
  if (saveError) {
    setupUpdateSettingEndpoint({ status: 500 });
  }
  renderWithProviders(
    <>
      <McpOAuthSettings />
      <UndoListing />
    </>,
  );
}

describe("McpOAuthSettings", () => {
  it("saves an exception for one exact registration without disabling global rotation", async () => {
    setup();
    expect(
      await screen.findByRole("switch", { name: /Rotate refresh tokens/ }),
    ).toBeChecked();
    await userEvent.click(
      await screen.findByPlaceholderText("Select registered clients"),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Codex (codex-one)" }),
    );
    const requests = await findRequests("PUT");
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain(
      "/setting/oauth-server-refresh-token-reuse-client-ids",
    );
    expect(requests[0].body).toEqual({ value: ["codex-one"] });
    expect(
      screen.getByRole("switch", { name: /Rotate refresh tokens/ }),
    ).toBeChecked();
  });

  it("can remove an exception", async () => {
    setup({ selectedIds: ["codex-one"] });
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Remove all token reuse exceptions",
      }),
    );
    const requests = await findRequests("PUT");
    expect(requests[0].body).toEqual({ value: [] });
  });

  it("retains the saved selection and reports a failed update", async () => {
    setup({ saveError: true });
    await userEvent.click(
      await screen.findByPlaceholderText("Select registered clients"),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Codex (codex-one)" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "Codex (codex-one)" }),
      ).toHaveAttribute("aria-selected", "false"),
    );
    expect(await screen.findByText(/Error saving/)).toBeInTheDocument();
  });

  it("explains when rotation is disabled globally", async () => {
    setup({ rotationEnabled: false });
    expect(
      await screen.findByText(/Rotation is disabled for all OAuth clients/),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Select registered clients"),
    ).not.toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("switch", { name: /Rotate refresh tokens/ }),
    );
    const requests = await findRequests("PUT");
    expect(requests[0].url).toContain(
      "/setting/oauth-server-rotate-refresh-tokens",
    );
    expect(requests[0].body).toEqual({ value: true });
    expect(
      await screen.findByPlaceholderText("Select registered clients"),
    ).toBeInTheDocument();
  });

  it("respects an environment-managed exception list", async () => {
    setup({ setByEnvironment: true });
    expect(
      await screen.findByText("MB_OAUTH_SERVER_REFRESH_TOKEN_REUSE_CLIENT_IDS"),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Select registered clients"),
    ).not.toBeInTheDocument();
  });

  it("explains an empty client list", async () => {
    setup({ clients: [] });
    await userEvent.click(
      await screen.findByPlaceholderText("Select registered clients"),
    );
    expect(
      await screen.findByText(
        "No registered clients found. Connect your client to Metabase first.",
      ),
    ).toBeInTheDocument();
  });

  it("reports a failure to load registered clients", async () => {
    setup({ clientsError: true });
    expect(
      await screen.findByText("Unable to load clients"),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Select registered clients"),
    ).not.toBeInTheDocument();
  });
});

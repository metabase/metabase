import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { EmbeddingHubChecklist } from "metabase/api/embedding-hub";
import { createMockSettings } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { SetupSsoPage } from "./SetupSsoPage";

const defaultChecklist: EmbeddingHubChecklist = {
  "add-data": false,
  "configure-row-column-security": false,
  "create-dashboard": false,
  "create-tenants": false,
  "create-test-embed": false,
  "data-permissions-and-enable-tenants": false,
  "embed-production": false,
  "enable-tenants": false,
  "move-dashboard-to-shared": false,
  "setup-data-segregation-strategy": false,
  "sso-auth-manual-tested": false,
  "sso-configured": false,
};

const setup = ({
  checklist = {},
}: {
  checklist?: Partial<EmbeddingHubChecklist>;
} = {}) => {
  const settings = createMockSettings();

  setupPropertiesEndpoints(settings);
  setupUpdateSettingsEndpoint();

  fetchMock.get("path:/api/ee/embedding-hub/checklist", {
    checklist: { ...defaultChecklist, ...checklist },
    "data-isolation-strategy": null,
  });
  fetchMock.get("path:/api/util/random_token", {
    token: "test-signing-key",
  });

  return renderWithProviders(
    <Route path="/admin/embedding/setup-guide/sso" component={SetupSsoPage} />,
    {
      storeInitialState: createMockState({
        settings: createMockSettingsState(settings),
      }),
      withRouter: true,
      initialRoute: "/admin/embedding/setup-guide/sso",
    },
  );
};

describe("SetupSsoPage", () => {
  it("locks steps 2 and 3 until JWT authentication is configured", async () => {
    setup();

    await screen.findByRole("button", {
      name: "Enable JWT authentication and continue",
    });

    const addEndpointStep = screen.getByRole("listitem", {
      name: "Add a new endpoint to your app",
    });
    const testJwtStep = screen.getByRole("listitem", {
      name: "Test that JWT authentication is working correctly",
    });

    expect(addEndpointStep).toHaveAttribute("data-locked", "true");
    expect(testJwtStep).toHaveAttribute("data-locked", "true");

    await userEvent.click(addEndpointStep);

    expect(
      screen.getByRole("button", {
        name: "Enable JWT authentication and continue",
      }),
    ).toBeVisible();
    expect(screen.queryByText("JWT Signing Key")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Try logging in with SSO. Did it work?"),
    ).not.toBeInTheDocument();
  });

  it("unlocks later steps immediately after step 1 succeeds", async () => {
    setup();

    const enableJwtButton = await screen.findByRole("button", {
      name: "Enable JWT authentication and continue",
    });

    await userEvent.type(
      screen.getByLabelText(/JWT Identity Provider URI/i),
      "https://jwt.example.com/auth",
    );
    await userEvent.click(enableJwtButton);

    expect(
      screen.getByRole("listitem", { name: "Set up JWT authentication" }),
    ).toHaveAttribute("data-completed", "true");
    expect(
      screen.getByRole("listitem", { name: "Add a new endpoint to your app" }),
    ).toHaveAttribute("data-locked", "false");
    expect(
      screen.getByRole("listitem", {
        name: "Test that JWT authentication is working correctly",
      }),
    ).toHaveAttribute("data-locked", "false");

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);

    const [{ url, body }] = puts;
    expect(url).toContain("/api/setting");
    expect(body).toEqual({
      "jwt-identity-provider-uri": "https://jwt.example.com/auth",
      "jwt-shared-secret": "test-signing-key",
      "jwt-enabled": true,
      "jwt-group-sync": true,
    });
  });
});

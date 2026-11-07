import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  createMockSetupGuideChecklist,
  findRequests,
  setupPropertiesEndpoints,
  setupSetupGuideChecklistEndpoint,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { createMockSettingsState, createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import type { TokenStatus } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenStatus,
} from "metabase-types/api/mocks";

import type { SetupGuideChecklist } from "../../api/setup-guide";

import { SetupSsoPage } from "./SetupSsoPage";

const setup = ({
  checklist = {},
  tokenStatus = null,
}: {
  checklist?: Partial<SetupGuideChecklist>;
  tokenStatus?: TokenStatus | null;
} = {}) => {
  const settings = createMockSettings({ "token-status": tokenStatus });

  setupPropertiesEndpoints(settings);
  setupUpdateSettingsEndpoint();

  setupSetupGuideChecklistEndpoint({
    checklist: createMockSetupGuideChecklist(checklist),
  });
  fetchMock.get("path:/api/util/random_token", {
    token: "test-signing-key",
  });

  return renderWithProviders(
    <Route path="/embedding/get-started/sso" element={<SetupSsoPage />} />,
    {
      storeInitialState: createMockState({
        settings: createMockSettingsState(settings),
      }),
      withRouter: true,
      initialRoute: "/embedding/get-started/sso",
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

  describe("troubleshooting help link", () => {
    const openTroubleshooting = async () => {
      const testJwtStep = await screen.findByRole("listitem", {
        name: "Test that JWT authentication is working correctly",
      });
      await waitFor(() =>
        expect(testJwtStep).toHaveAttribute("data-locked", "false"),
      );
      await userEvent.click(testJwtStep);
      await userEvent.click(
        screen.getByRole("button", { name: "No, I couldn't log in" }),
      );
      expect(await screen.findByText("Troubleshooting")).toBeVisible();
    };

    it("links to /help-premium with a valid token", async () => {
      setup({
        checklist: { "sso-configured": true },
        tokenStatus: createMockTokenStatus({ valid: true }),
      });

      await openTroubleshooting();

      expect(
        screen.getByRole("link", { name: "Contact customer support" }),
      ).toHaveAttribute(
        "href",
        expect.stringContaining("metabase.com/help-premium"),
      );
    });

    it("links to /help instead of /help-premium without a paid plan", async () => {
      setup({ checklist: { "sso-configured": true } });

      await openTroubleshooting();

      const href = screen
        .getByRole("link", { name: "Contact customer support" })
        .getAttribute("href");
      expect(href).toContain("metabase.com/help?");
      expect(href).not.toContain("help-premium");
    });
  });
});

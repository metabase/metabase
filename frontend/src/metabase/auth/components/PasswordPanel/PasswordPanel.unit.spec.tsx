import React from "react";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";
import MetabaseSettings from "metabase/lib/settings";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import { setupLoginEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { PasswordPanel } from "./PasswordPanel";

const TEST_EMAIL = "user@example.test";
const TEST_PASSWORD = "password";

interface SetupOpts {
  isGoogleAuthEnabled?: boolean;
}

const setup = ({ isGoogleAuthEnabled = false }: SetupOpts = {}) => {
  const state = createMockState({
    settings: createMockSettingsState({
      "google-auth-enabled": isGoogleAuthEnabled,
    }),
  });

  MetabaseSettings.set("google-auth-enabled", isGoogleAuthEnabled);

  setupLoginEndpoint();
  renderWithProviders(<PasswordPanel />, { storeInitialState: state });
};

describe("PasswordPanel", () => {
  afterEach(() => {
    MetabaseSettings.set("google-auth-enabled", false);
  });

  it("should login successfully", async () => {
    setup();

    userEvent.type(screen.getByLabelText("Email address"), TEST_EMAIL);
    userEvent.type(screen.getByLabelText("Password"), TEST_PASSWORD);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    });

    userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(fetchMock.done("path:/api/session")).toBe(true);
    });
  });

  it("should render a link to reset the password and a list of auth providers", () => {
    setup({ isGoogleAuthEnabled: true });

    expect(screen.getByText(/forgotten my password/)).toBeInTheDocument();
    expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
  });
});

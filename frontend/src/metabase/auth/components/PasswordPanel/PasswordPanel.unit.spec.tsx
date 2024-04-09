import "metabase/plugins/builtin";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCurrentUserEndpoint,
  setupLoginEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import MetabaseSettings from "metabase/lib/settings";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

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
  setupCurrentUserEndpoint(createMockUser());
  setupPropertiesEndpoints(createMockSettings());
  renderWithProviders(<PasswordPanel />, { storeInitialState: state });
};

const cleanUp = () => {
  MetabaseSettings.set("google-auth-enabled", false);
};

describe("PasswordPanel", () => {
  afterEach(() => {
    cleanUp();
  });

  it("should login successfully", async () => {
    setup();

    await userEvent.type(screen.getByLabelText("Email address"), TEST_EMAIL);
    await userEvent.type(screen.getByLabelText("Password"), TEST_PASSWORD);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    });

    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

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

import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupMfaStatusEndpoint,
  setupMfaStatusEndpointError,
  setupStatefulMfaAccountEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import type { MfaEnforcement, MfaStatus } from "metabase-types/api";
import {
  createMockMfaEnrollResponse,
  createMockMfaStatus,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { AccountSecurityPanel } from "./AccountSecurityPanel";

const PASSWORD = "Pa55word!";
const CODE = "246810";
const NEW_SECRET = "NEWSECRET234567";
const NEW_RECOVERY_CODES = ["aaaaa-11111", "bbbbb-22222"];

type SetupOpts = {
  status?: MfaStatus;
  hasStatusError?: boolean;
  hasFeature?: boolean;
  enforcement?: MfaEnforcement;
  isStateful?: boolean;
};

function setup({
  status = createMockMfaStatus(),
  hasStatusError = false,
  hasFeature = true,
  enforcement = "optional",
  isStateful = false,
}: SetupOpts = {}) {
  if (hasStatusError) {
    setupMfaStatusEndpointError();
  } else if (isStateful) {
    setupStatefulMfaAccountEndpoints({
      status,
      password: PASSWORD,
      code: CODE,
      enrollResponse: createMockMfaEnrollResponse({
        secret: NEW_SECRET,
        otpauth_uri: `otpauth://totp/Metabase?secret=${NEW_SECRET}`,
      }),
      recoveryCodes: NEW_RECOVERY_CODES,
    });
  } else {
    setupMfaStatusEndpoint(status);
  }

  renderWithProviders(<AccountSecurityPanel />, {
    storeInitialState: createMockState({
      settings: mockSettings({
        "mfa-enforcement": enforcement,
        "token-features": createMockTokenFeatures({
          "multi-factor-auth": hasFeature,
        }),
      }),
    }),
  });
}

function lastRequestBody(path: string): unknown {
  const call = fetchMock.callHistory.calls(`path:${path}`).at(-1);
  return call ? JSON.parse(String(call.options.body)) : undefined;
}

describe("AccountSecurityPanel", () => {
  it("should let an enrolled user disable 2FA with a code and then set it up again", async () => {
    setup({
      status: createMockMfaStatus({ enrolled: true }),
      isStateful: true,
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Disable" }),
    );
    const disableModal = await screen.findByRole("dialog", {
      name: "Disable two-factor authentication",
    });
    expect(
      within(disableModal).getByText(
        "Are you sure you want to disable two-factor authentication? Your account will be protected by your password only, and your recovery codes will stop working.",
      ),
    ).toBeInTheDocument();
    await userEvent.type(
      within(disableModal).getByLabelText(
        "Confirm with an authenticator code or a recovery code",
      ),
      CODE,
    );
    await userEvent.click(
      within(disableModal).getByRole("button", { name: "Disable" }),
    );

    const setupButton = await screen.findByRole("button", {
      name: "Set up two-factor authentication",
    });
    expect(setupButton).toBeEnabled();
    expect(lastRequestBody("/api/ee/mfa/disable")).toEqual({ code: CODE });
    expect(
      screen.queryByRole("button", { name: "Disable" }),
    ).not.toBeInTheDocument();
    // In a browser an open dialog blocks the setup button, so it must close
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "Disable two-factor authentication",
        }),
      ).not.toBeInTheDocument();
    });

    await userEvent.click(setupButton);
    const setupModal = await screen.findByRole("dialog", {
      name: "Set up two-factor authentication",
    });
    await userEvent.type(
      within(setupModal).getByLabelText("Confirm your password to begin"),
      PASSWORD,
    );
    await userEvent.click(
      within(setupModal).getByRole("button", { name: "Continue" }),
    );

    expect(await within(setupModal).findByText(NEW_SECRET)).toBeInTheDocument();
    expect(lastRequestBody("/api/ee/mfa/enroll")).toEqual({
      password: PASSWORD,
    });
    await userEvent.type(
      within(setupModal).getByLabelText(
        "Enter the 6-digit code from the authenticator app",
      ),
      CODE,
    );
    await userEvent.click(
      within(setupModal).getByRole("button", { name: "Set up authentication" }),
    );

    expect(
      await within(setupModal).findByText("Your recovery codes"),
    ).toBeInTheDocument();
    expect(
      within(setupModal).getByText(NEW_RECOVERY_CODES[1]),
    ).toBeInTheDocument();
    expect(lastRequestBody("/api/ee/mfa/enroll/confirm")).toEqual({
      code: CODE,
    });
    await userEvent.click(
      within(setupModal).getByRole("button", { name: "Done" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "Set up two-factor authentication",
        }),
      ).not.toBeInTheDocument();
    });
    expect(
      await screen.findByRole("button", { name: "Disable" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate recovery codes" }),
    ).toBeInTheDocument();
  });

  it("should open the setup modal when the user is not enrolled", async () => {
    setup({ status: createMockMfaStatus({ enrolled: false }) });

    const setupButton = await screen.findByRole("button", {
      name: "Set up two-factor authentication",
    });
    expect(setupButton).toBeEnabled();

    await userEvent.click(setupButton);
    expect(
      await screen.findByRole("dialog", {
        name: "Set up two-factor authentication",
      }),
    ).toBeInTheDocument();
  });

  it("should disable the setup button without the token feature", async () => {
    setup({
      status: createMockMfaStatus({ enrolled: false }),
      hasFeature: false,
    });

    expect(
      await screen.findByRole("button", {
        name: "Set up two-factor authentication",
      }),
    ).toBeDisabled();
  });

  it("should open the disable modal when the user is enrolled", async () => {
    setup({ status: createMockMfaStatus({ enrolled: true }) });

    await userEvent.click(
      await screen.findByRole("button", { name: "Disable" }),
    );

    expect(
      await screen.findByRole("dialog", {
        name: "Disable two-factor authentication",
      }),
    ).toBeInTheDocument();
  });

  it("should open the recovery codes modal when the user is enrolled", async () => {
    setup({ status: createMockMfaStatus({ enrolled: true }) });

    await userEvent.click(
      await screen.findByRole("button", {
        name: "Generate recovery codes",
      }),
    );

    expect(
      await screen.findByRole("dialog", {
        name: "Generate recovery codes",
      }),
    ).toBeInTheDocument();
  });
  it("should render nothing when the instance has two-factor authentication off", async () => {
    setup({
      status: createMockMfaStatus({ mfa_enabled: false, enrolled: true }),
    });

    await waitForLoaderToBeRemoved();

    expect(
      screen.queryByText("Two-factor authentication"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  describe("when two-factor authentication is required", () => {
    it("should not let an enrolled user disable it", async () => {
      setup({
        status: createMockMfaStatus({ enrolled: true }),
        enforcement: "required",
      });

      expect(
        await screen.findByRole("button", { name: "Disable" }),
      ).toBeDisabled();
    });
  });

  it("should show an error message when the status cannot be loaded", async () => {
    setup({ hasStatusError: true });

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
  });
});

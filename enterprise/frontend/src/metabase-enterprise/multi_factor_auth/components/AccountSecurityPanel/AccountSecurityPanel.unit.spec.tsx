import userEvent from "@testing-library/user-event";

import {
  setupMfaStatusEndpoint,
  setupMfaStatusEndpointError,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { MfaStatus } from "metabase-types/api";
import {
  createMockMfaStatus,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { AccountSecurityPanel } from "./AccountSecurityPanel";

type SetupOpts = {
  status?: MfaStatus;
  hasStatusError?: boolean;
  hasFeature?: boolean;
};

function setup({
  status = createMockMfaStatus(),
  hasStatusError = false,
  hasFeature = true,
}: SetupOpts = {}) {
  if (hasStatusError) {
    setupMfaStatusEndpointError();
  } else {
    setupMfaStatusEndpoint(status);
  }

  renderWithProviders(<AccountSecurityPanel />, {
    storeInitialState: createMockState({
      settings: mockSettings({
        "token-features": createMockTokenFeatures({
          "multi-factor-auth": hasFeature,
        }),
      }),
    }),
  });
}

describe("AccountSecurityPanel", () => {
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

  it("should show an error message when the status cannot be loaded", async () => {
    setup({ hasStatusError: true });

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
  });
});

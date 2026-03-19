import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupForgotPasswordEndpoint } from "__support__/server-mocks/session";
import {
  setupPasswordResetUrlEndpoint,
  setupUpdatePasswordEndpoint,
  setupUserEndpoints,
} from "__support__/server-mocks/user";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { UserListResult } from "metabase-types/api";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { UserPasswordResetModal } from "./UserPasswordResetModal";

const TEST_USER = createMockUser({
  id: 42,
  first_name: "Ash",
  last_name: "Ketchum",
  email: "ash@example.com",
  common_name: "Ash Ketchum",
});

function setup({ emailConfigured = false } = {}) {
  setupUserEndpoints(TEST_USER as unknown as UserListResult);
  setupPasswordResetUrlEndpoint(TEST_USER.id);
  setupForgotPasswordEndpoint();
  setupUpdatePasswordEndpoint(TEST_USER.id);

  const storeInitialState = createMockState({
    settings: mockSettings(
      createMockSettings({
        "email-configured?": emailConfigured,
      }),
    ),
  });

  const onCloseSpy = jest.fn();
  renderWithProviders(
    <UserPasswordResetModal
      params={{ userId: String(TEST_USER.id) }}
      onClose={onCloseSpy}
    />,
    { storeInitialState },
  );
  return { onCloseSpy };
}

describe("UserPasswordResetModal", () => {
  it("should render the confirmation dialog with 'Get reset link' button", async () => {
    setup();
    expect(
      await screen.findByRole("button", { name: "Get reset link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reset password" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("should show reset URL after clicking 'Get reset link'", async () => {
    setup();
    await screen.findByRole("button", { name: "Get reset link" });

    await userEvent.click(
      screen.getByRole("button", { name: "Get reset link" }),
    );

    expect(
      await screen.findByText(
        "Share this link with the user. It will expire in 48 hours.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();

    const call = fetchMock.callHistory.lastCall(
      `path:/api/user/${TEST_USER.id}/password-reset-url`,
      { method: "POST" },
    );
    expect(call).toBeTruthy();
  });

  it("should call onClose when clicking Done after getting reset link", async () => {
    const { onCloseSpy } = setup();
    await screen.findByRole("button", { name: "Get reset link" });

    await userEvent.click(
      screen.getByRole("button", { name: "Get reset link" }),
    );
    await screen.findByText(
      "Share this link with the user. It will expire in 48 hours.",
    );

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onCloseSpy).toHaveBeenCalled();
  });
});

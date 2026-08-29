import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCurrentUserEndpoint,
  setupMfaSendEmailOtpEndpoint,
  setupMfaVerifyEndpoint,
  setupMfaVerifyEndpointError,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { MfaMethod } from "metabase-types/api";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";

import { AuthChallengeForm } from "./AuthChallengeForm";

type SetupOpts = {
  methods?: MfaMethod[];
  hasVerifyError?: boolean;
};

function setup({ methods = ["totp"], hasVerifyError = false }: SetupOpts = {}) {
  if (hasVerifyError) {
    setupMfaVerifyEndpointError();
  } else {
    setupMfaVerifyEndpoint();
  }
  setupMfaSendEmailOtpEndpoint();
  setupCurrentUserEndpoint(createMockUser());
  setupPropertiesEndpoints(createMockSettings());

  const onCancel = jest.fn();

  renderWithProviders(
    <AuthChallengeForm
      challengeToken="challenge-token"
      methods={methods}
      onCancel={onCancel}
    />,
  );

  return { onCancel };
}

async function submitCode() {
  await userEvent.type(screen.getByLabelText("Authenticator code"), "123456");
  await userEvent.click(screen.getByRole("button", { name: "Verify" }));
}

describe("AuthChallengeForm", () => {
  it("should verify the code and refresh the session", async () => {
    setup();

    await submitCode();

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/session/mfa/verify"),
      ).toHaveLength(1);
    });
  });

  it("should show an error message when the code is rejected", async () => {
    setup({ hasVerifyError: true });

    await submitCode();

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
  });

  it("should send an email code when the email method is available", async () => {
    setup({ methods: ["totp", "email"] });

    await userEvent.click(
      screen.getByRole("button", { name: "Email me a code" }),
    );

    expect(
      await screen.findByText("Code sent — check your email"),
    ).toBeInTheDocument();
  });
});

import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCurrentUserEndpoint,
  setupMfaEnrollOnLoginEndpoint,
  setupMfaEnrollOnLoginEndpointError,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";

import { AuthEnrollmentForm } from "./AuthEnrollmentForm";

const RECOVERY_CODES = ["aaaaa-11111", "bbbbb-22222"];

type SetupOpts = {
  hasEnrollError?: boolean;
};

function setup({ hasEnrollError = false }: SetupOpts = {}) {
  if (hasEnrollError) {
    setupMfaEnrollOnLoginEndpointError();
  } else {
    setupMfaEnrollOnLoginEndpoint(RECOVERY_CODES);
  }
  setupCurrentUserEndpoint(createMockUser());
  setupPropertiesEndpoints(createMockSettings());

  const onCancel = jest.fn();

  renderWithProviders(
    <AuthEnrollmentForm
      enrollmentToken="enrollment-token"
      secret="TOTPSECRET"
      otpauthUri="otpauth://totp/Metabase:user@example.test?secret=TOTPSECRET"
      onCancel={onCancel}
    />,
  );

  return { onCancel };
}

async function submitCode() {
  await userEvent.type(
    screen.getByLabelText("Enter the 6-digit code from the authenticator app"),
    "123456",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Set up authentication" }),
  );
}

const loginRequests = () =>
  fetchMock.callHistory.calls("path:/api/user/current");

describe("AuthEnrollmentForm", () => {
  it("should show the QR code and the manual secret", () => {
    setup();

    expect(screen.getByText("TOTPSECRET")).toBeInTheDocument();
    expect(
      screen.getByText("Scan this QR code with an authenticator app:"),
    ).toBeInTheDocument();
  });

  it("should enroll the second factor and then show the recovery codes", async () => {
    setup();

    await submitCode();

    expect(await screen.findByText(RECOVERY_CODES[0])).toBeInTheDocument();
    expect(screen.getByText(RECOVERY_CODES[1])).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls("path:/api/session/mfa/enroll"),
    ).toHaveLength(1);
  });

  it("should not complete the login until the recovery codes are acknowledged", async () => {
    setup();

    await submitCode();
    await screen.findByText(RECOVERY_CODES[0]);

    expect(loginRequests()).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(loginRequests().length).toBeGreaterThan(0);
    });
  });

  it("should not offer a way back to log in once enrolled", async () => {
    setup();

    expect(
      screen.getByRole("button", { name: "Back to log in" }),
    ).toBeInTheDocument();

    await submitCode();
    await screen.findByText(RECOVERY_CODES[0]);

    expect(
      screen.queryByRole("button", { name: "Back to log in" }),
    ).not.toBeInTheDocument();
  });

  it("should keep the user on the form when the code is rejected", async () => {
    setup({ hasEnrollError: true });

    await submitCode();

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    expect(screen.queryByText(RECOVERY_CODES[0])).not.toBeInTheDocument();
    expect(loginRequests()).toHaveLength(0);
  });

  it("should cancel back to the login form", async () => {
    const { onCancel } = setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Back to log in" }),
    );

    expect(onCancel).toHaveBeenCalled();
  });
});

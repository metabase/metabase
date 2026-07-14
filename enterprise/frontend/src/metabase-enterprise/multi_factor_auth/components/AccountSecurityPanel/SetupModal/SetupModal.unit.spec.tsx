import userEvent from "@testing-library/user-event";

import {
  setupMfaEnrollEndpoint,
  setupMfaEnrollEndpointError,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockMfaEnrollResponse } from "metabase-types/api/mocks";

import { SetupModal } from "./SetupModal";

const SECRET = "ABCDE23456";

type SetupOpts = {
  hasEnrollError?: boolean;
};

function setup({ hasEnrollError = false }: SetupOpts = {}) {
  if (hasEnrollError) {
    setupMfaEnrollEndpointError();
  } else {
    setupMfaEnrollEndpoint(
      createMockMfaEnrollResponse({
        secret: SECRET,
        otpauth_uri: `otpauth://totp/test?secret=${SECRET}`,
      }),
    );
  }

  const onSuccess = jest.fn();
  const onCancel = jest.fn();

  renderWithProviders(
    <SetupModal opened onSuccess={onSuccess} onCancel={onCancel} />,
  );

  return { onSuccess, onCancel };
}

async function submitPassword() {
  await userEvent.type(
    screen.getByLabelText("Confirm your password to begin"),
    "password",
  );
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("SetupModal", () => {
  it("should show the enrollment step after confirming the password", async () => {
    setup();

    await submitPassword();

    expect(
      await screen.findByText("Scan this QR code with an authenticator app:"),
    ).toBeInTheDocument();
    expect(screen.getByText(SECRET)).toBeInTheDocument();
  });

  it("should show an error message when enrollment fails", async () => {
    setup({ hasEnrollError: true });

    await submitPassword();

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
  });
});

import userEvent from "@testing-library/user-event";

import {
  setupMfaRecoveryCodesEndpoint,
  setupMfaRecoveryCodesEndpointError,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";

import { RecoveryCodesModal } from "./RecoveryCodesModal";

const RECOVERY_CODES = ["aaaaa-bbbbb", "ccccc-ddddd"];

type SetupOpts = {
  hasRegenerateError?: boolean;
};

function setup({ hasRegenerateError = false }: SetupOpts = {}) {
  if (hasRegenerateError) {
    setupMfaRecoveryCodesEndpointError();
  } else {
    setupMfaRecoveryCodesEndpoint(RECOVERY_CODES);
  }

  const onSuccess = jest.fn();
  const onCancel = jest.fn();

  renderWithProviders(
    <RecoveryCodesModal opened onSuccess={onSuccess} onCancel={onCancel} />,
  );

  return { onSuccess, onCancel };
}

async function submitCode() {
  await userEvent.type(
    screen.getByLabelText(
      "Confirm with an authenticator code or a recovery code",
    ),
    "123456",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Generate new codes" }),
  );
}

describe("RecoveryCodesModal", () => {
  it("should show the new codes after confirming with a valid code", async () => {
    setup();

    await submitCode();

    expect(
      await screen.findByText(new RegExp(RECOVERY_CODES[0])),
    ).toBeInTheDocument();
    expect(screen.getByText(new RegExp(RECOVERY_CODES[1]))).toBeInTheDocument();
  });

  it("should show an error message when the code is rejected", async () => {
    setup({ hasRegenerateError: true });

    await submitCode();

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
  });
});

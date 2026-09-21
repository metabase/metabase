import userEvent from "@testing-library/user-event";

import {
  setupMfaDisableEndpoint,
  setupMfaDisableEndpointError,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { DisableModal } from "./DisableModal";

type SetupOpts = {
  hasDisableError?: boolean;
};

function setup({ hasDisableError = false }: SetupOpts = {}) {
  if (hasDisableError) {
    setupMfaDisableEndpointError();
  } else {
    setupMfaDisableEndpoint();
  }

  const onSuccess = jest.fn();
  const onCancel = jest.fn();

  renderWithProviders(
    <DisableModal opened onSuccess={onSuccess} onCancel={onCancel} />,
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
  await userEvent.click(screen.getByRole("button", { name: "Disable" }));
}

describe("DisableModal", () => {
  it("should call onSuccess after disabling with a valid code", async () => {
    const { onSuccess } = setup();

    await submitCode();

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("should show an error message when the code is rejected", async () => {
    const { onSuccess } = setup({ hasDisableError: true });

    await submitCode();

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

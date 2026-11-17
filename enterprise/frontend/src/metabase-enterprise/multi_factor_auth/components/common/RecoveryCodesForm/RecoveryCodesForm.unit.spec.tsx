import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { RecoveryCodesForm } from "./RecoveryCodesForm";

const RECOVERY_CODES = ["aaaaa-bbbbb", "ccccc-ddddd"];
const MESSAGE = "Save these codes somewhere safe.";

function setup() {
  const onDone = jest.fn();

  renderWithProviders(
    <RecoveryCodesForm
      recoveryCodes={RECOVERY_CODES}
      message={MESSAGE}
      onDone={onDone}
    />,
  );

  return { onDone };
}

describe("RecoveryCodesForm", () => {
  it("should show the message and the codes", () => {
    setup();

    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(RECOVERY_CODES[0]))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(RECOVERY_CODES[1]))).toBeInTheDocument();
  });

  it("should call onDone when the codes are acknowledged", async () => {
    const { onDone } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onDone).toHaveBeenCalled();
  });
});

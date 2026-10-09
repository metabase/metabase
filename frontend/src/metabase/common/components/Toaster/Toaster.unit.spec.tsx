import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import type { UndoVariant } from "metabase/redux/store/undo";

import { Toast } from "./Toaster";

function setup({ variant }: { variant?: UndoVariant } = {}) {
  const onConfirm = jest.fn();
  const onSecondary = jest.fn();
  const onDismiss = jest.fn();

  render(
    <Toast
      show
      variant={variant}
      message="Something happened"
      confirmText="Retry"
      confirmAriaLabel="Retry"
      secondaryText="Details"
      secondaryAriaLabel="Details"
      onConfirm={onConfirm}
      onSecondary={onSecondary}
      onDismiss={onDismiss}
    />,
  );

  return { onConfirm, onSecondary, onDismiss };
}

describe("Toast", () => {
  it("renders the neutral variant by default", () => {
    setup();

    expect(screen.getByTestId("toast")).toHaveAttribute(
      "data-variant",
      "neutral",
    );
  });

  it("places the primary action after the secondary action", () => {
    setup();

    expect(
      screen
        .getAllByRole("button", { name: /Retry|Details/ })
        .map((button) => button.textContent),
    ).toEqual(["Details", "Retry"]);
  });

  it.each<UndoVariant>(["negative", "warning"])(
    "renders the %s variant with working actions",
    async (variant) => {
      const { onConfirm, onSecondary, onDismiss } = setup({ variant });

      expect(screen.getByTestId("toast")).toHaveAttribute(
        "data-variant",
        variant,
      );
      expect(screen.getByText("Something happened")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(onConfirm).toHaveBeenCalledTimes(1);

      await userEvent.click(screen.getByRole("button", { name: "Details" }));
      expect(onSecondary).toHaveBeenCalledTimes(1);

      await userEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    },
  );
});

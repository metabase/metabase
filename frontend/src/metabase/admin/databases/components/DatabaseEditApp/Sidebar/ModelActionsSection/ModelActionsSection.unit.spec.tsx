import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { render, screen, waitFor } from "__support__/ui";

import type { ModelActionsSectionProps } from "./ModelActionsSection";
import ModelActionsSection from "./ModelActionsSection";

function ModelActionSectionWrapper({
  hasModelActionsEnabled: initialValue,
  onToggleModelActionsEnabled: onChange,
}: ModelActionsSectionProps) {
  const [isEnabled, setEnabled] = useState(initialValue);

  const handleChange = async (nextValue: boolean) => {
    await onChange(nextValue);
    setEnabled(nextValue);
  };

  return (
    <ModelActionsSection
      hasModelActionsEnabled={isEnabled}
      onToggleModelActionsEnabled={handleChange}
    />
  );
}

function setup({
  hasModelActionsEnabled = false,
  onToggleModelActionsEnabled = jest.fn(),
}: Partial<ModelActionsSectionProps>) {
  render(
    <ModelActionSectionWrapper
      hasModelActionsEnabled={hasModelActionsEnabled}
      onToggleModelActionsEnabled={onToggleModelActionsEnabled}
    />,
  );

  const toggle = screen.getByLabelText("Model actions");

  return { toggle, onToggleModelActionsEnabled };
}

describe("ModelActionsSection", () => {
  it("should allow toggling actions", async () => {
    const { toggle, onToggleModelActionsEnabled } = setup({
      hasModelActionsEnabled: false,
    });

    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);

    await waitFor(() => expect(toggle).toBeChecked());
    expect(onToggleModelActionsEnabled).toHaveBeenLastCalledWith(true);

    await userEvent.click(toggle);

    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(onToggleModelActionsEnabled).toHaveBeenLastCalledWith(false);
  });

  it("should handle errors while toggling actions", async () => {
    const errorMessage = "Lacking write database permissions";
    const onToggleModelActionsEnabled = jest.fn().mockRejectedValueOnce({
      data: { message: errorMessage },
    });

    const { toggle } = setup({
      hasModelActionsEnabled: false,
      onToggleModelActionsEnabled,
    });

    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(screen.getByText(errorMessage)).toBeInTheDocument();

    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(screen.queryByText(errorMessage)).not.toBeInTheDocument();
    expect(onToggleModelActionsEnabled).toHaveBeenLastCalledWith(true);
  });
});

import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { render, screen, waitFor } from "__support__/ui";

import type { DataActionsSectionProps } from "./DataActionsSection";
import { DataActionsSection } from "./DataActionsSection";

function ModelActionSectionWrapper({
  hasDataActionsEnabled: initialValue,
  onToggleDataActionsEnabled: onChange,
  disabled,
}: DataActionsSectionProps) {
  const [isEnabled, setEnabled] = useState(initialValue);

  const handleChange = async (nextValue: boolean) => {
    await onChange(nextValue);
    setEnabled(nextValue);
  };

  return (
    <DataActionsSection
      hasDataActionsEnabled={isEnabled}
      onToggleDataActionsEnabled={handleChange}
      disabled={disabled}
    />
  );
}

function setup({
  hasDataActionsEnabled = false,
  onToggleDataActionsEnabled = jest.fn(),
  disabled = false,
}: Partial<DataActionsSectionProps>) {
  render(
    <ModelActionSectionWrapper
      hasDataActionsEnabled={hasDataActionsEnabled}
      onToggleDataActionsEnabled={onToggleDataActionsEnabled}
      disabled={disabled}
    />,
  );

  const toggle = screen.getByLabelText("Data actions");

  return { toggle, onToggleDataActionsEnabled };
}

describe("DataActionsSection", () => {
  it("should allow toggling actions", async () => {
    const { toggle, onToggleDataActionsEnabled } = setup({
      hasDataActionsEnabled: false,
    });

    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);

    await waitFor(() => expect(toggle).toBeChecked());
    expect(onToggleDataActionsEnabled).toHaveBeenLastCalledWith(true);

    await userEvent.click(toggle);

    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(onToggleDataActionsEnabled).toHaveBeenLastCalledWith(false);
  });

  it("should not allow toggling actions if section is disabled", async () => {
    const { toggle } = setup({ disabled: true });
    expect(toggle).toBeDisabled();
  });

  it("should handle errors while toggling actions", async () => {
    const errorMessage = "Lacking write database permissions";
    const onToggleDataActionsEnabled = jest.fn().mockRejectedValueOnce({
      data: { message: errorMessage },
    });

    const { toggle } = setup({
      hasDataActionsEnabled: false,
      onToggleDataActionsEnabled,
    });

    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(await screen.findByText(errorMessage)).toBeInTheDocument();

    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(screen.queryByText(errorMessage)).not.toBeInTheDocument();
    expect(onToggleDataActionsEnabled).toHaveBeenLastCalledWith(true);
  });
});

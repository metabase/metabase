import { fireEvent } from "@testing-library/react";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { TrialBanner } from "./TrialBanner";

function setup({
  daysRemaining,
  onClose,
}: {
  daysRemaining: number;
  onClose: () => void;
}) {
  return renderWithProviders(
    <TrialBanner daysRemaining={daysRemaining} onClose={onClose} />,
    {
      storeInitialState: {
        settings: createMockSettingsState(
          createMockSettings({
            "store-url": "https://store.metabase.com",
          }),
        ),
      },
    },
  );
}

describe("TrialBanner", () => {
  it("should trigger `onClose` on the _close_ icon click", () => {
    const clickHandler = jest.fn();
    setup({ daysRemaining: 6, onClose: clickHandler });

    expect(screen.getByText("6 days left in your trial.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Manage your subscription." }),
    ).toHaveAttribute(
      "href",
      "https://store.metabase.com/account/manage/plans",
    );

    const closeButton = screen.getByLabelText("close icon");
    fireEvent.click(closeButton);

    expect(clickHandler).toHaveBeenCalledTimes(1);
  });

  it("should render correctly with the 1 day remaining", () => {
    setup({ daysRemaining: 1, onClose: () => {} });

    expect(screen.getByText("1 day left in your trial.")).toBeInTheDocument();
  });

  it("should render correctly on the last day of the trial", () => {
    setup({ daysRemaining: 0, onClose: () => {} });

    expect(
      screen.getByText("Today is the last day of your trial."),
    ).toBeInTheDocument();
  });
});

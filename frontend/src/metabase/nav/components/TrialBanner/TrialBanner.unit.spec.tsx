import { fireEvent, render, screen } from "@testing-library/react";

import { TrialBanner } from "./TrialBanner";

describe("TrialBanner", () => {
  it("should trigger `onClose` on the _close_ icon click", () => {
    const clickHandler = jest.fn();
    render(<TrialBanner daysRemaining={6} onClose={clickHandler} />);

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
    render(<TrialBanner daysRemaining={1} onClose={() => {}} />);

    expect(screen.getByText("1 day left in your trial.")).toBeInTheDocument();
  });

  it("should render correctly on the last day of the trial", () => {
    render(<TrialBanner daysRemaining={0} onClose={() => {}} />);

    expect(
      screen.getByText("Today is the last day of your trial."),
    ).toBeInTheDocument();
  });
});

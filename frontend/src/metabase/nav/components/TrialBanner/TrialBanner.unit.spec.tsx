import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";

import { useUserSetting } from "metabase/common/hooks";

import { TrialBanner } from "./TrialBanner";

jest.mock("metabase/common/hooks", () => ({
  useUserSetting: jest.fn(),
}));

describe("TrialBanner", () => {
  const getCopy = (daysRemaining: number) => {
    if (daysRemaining === 0) {
      return "Today is the last day of your trial.";
    }

    return `${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} left in your trial.`;
  };

  const mockCurrentTimestamp = jest.fn();

  beforeEach(() => {
    jest
      .spyOn(dayjs.prototype, "toISOString")
      .mockImplementation(mockCurrentTimestamp);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should call handleBannerClose and set the correct timestamp on close icon click", async () => {
    const currentTime = "2024-12-25T23:00:00.000Z";
    const dismissalTime = "2024-12-25T23:35:36.000Z";

    const setLastDismissed = jest.fn();
    (useUserSetting as jest.Mock).mockReturnValue([null, setLastDismissed]);

    mockCurrentTimestamp.mockReturnValue(currentTime);
    render(<TrialBanner tokenExpiryTimestamp="2024-12-31T23:00:00.000Z" />);

    expect(screen.getByText("6 days left in your trial.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Manage your subscription." }),
    ).toHaveAttribute(
      "href",
      "https://store.metabase.com/account/manage/plans",
    );

    mockCurrentTimestamp.mockReturnValue(dismissalTime);
    const closeButton = screen.getByLabelText("close icon");
    await userEvent.click(closeButton);

    expect(setLastDismissed).toHaveBeenCalledTimes(1);
    expect(setLastDismissed).toHaveBeenCalledWith(dismissalTime);
  });

  it.each([
    [3, "2024-12-28T23:00:00.000Z"],
    [2, "2024-12-29T23:00:00.000Z"],
    [1, "2024-12-30T23:00:00.000Z"],
    [0, "2024-12-31T23:00:00.000Z"],
  ])(
    "should render correctly with the %s days remaining",
    (daysRemaining, currentTimestamp) => {
      (useUserSetting as jest.Mock).mockReturnValue([null]);
      mockCurrentTimestamp.mockReturnValue(currentTimestamp);

      render(<TrialBanner tokenExpiryTimestamp="2024-12-31T23:00:00.000Z" />);

      expect(screen.getByText(getCopy(daysRemaining))).toBeInTheDocument();
    },
  );
});

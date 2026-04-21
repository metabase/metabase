import _userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { SingleDatePickerBody } from "./SingleDatePickerBody";

const userEvent = _userEvent.setup({
  advanceTimers: jest.advanceTimersByTime,
});

interface SetupOpts {
  value?: Date;
  hasTime?: boolean;
}

function setup({
  value = new Date(2020, 0, 10),
  hasTime = false,
}: SetupOpts = {}) {
  renderWithProviders(
    <SingleDatePickerBody
      value={value}
      hasTime={hasTime}
      onChange={jest.fn()}
    />,
  );
}

describe("SingleDatePickerBody", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 15));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("should navigate back one month when clicking previous month button from September 1st (metabase#63308)", async () => {
    setup({ value: new Date(2020, 8, 1) });

    expect(screen.getByText("September 2020")).toBeInTheDocument();

    const prevButton = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("data-direction") === "previous");

    expect(prevButton).toBeTruthy();
    await userEvent.click(prevButton!);

    expect(await screen.findByText("August 2020")).toBeInTheDocument();
    expect(screen.queryByText("July 2020")).not.toBeInTheDocument();
  });
});

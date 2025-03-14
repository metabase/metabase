import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockScrollIntoView, screen } from "__support__/ui";
import { setup } from "metabase/components/Schedule/test-utils";

const getInputValues = () => {
  const inputs = screen.getAllByRole("textbox");
  const values = inputs.map(input => input.getAttribute("value"));
  return values;
};

describe("Schedule", () => {
  beforeAll(() => {
    mockScrollIntoView();
  });

  it("shows time when schedule is daily", () => {
    setup();
    expect(getInputValues()).toEqual(["daily", "12:00"]);
  });

  it("shows minutes schedule is hourly and minutesOnHourPicker is true", () => {
    setup({ schedule: { schedule_type: "hourly" }, minutesOnHourPicker: true });
    expect(getInputValues()).toEqual(["hourly", "0"]);
    expect(screen.getByText("minutes past the hour")).toBeInTheDocument();
  });

  it("shows day and time when schedule is weekly", () => {
    setup({
      schedule: { schedule_type: "weekly", schedule_day: "mon" },
    });
    expect(getInputValues()).toEqual(["weekly", "Monday", "8:00"]);
  });

  it("shows first/last/mid value, day, and time when schedule is monthly", async () => {
    setup({
      schedule: {
        schedule_type: "monthly",
        schedule_frame: "first",
        schedule_day: "mon",
      },
    });
    expect(getInputValues()).toEqual(["monthly", "first", "Monday", "8:00"]);
  });

  it("shows 10 minutes by default for minutely schedule", () => {
    setup({
      schedule: { schedule_type: "minutely" },
    });
    // screen.debug(undefined, 1000000);
    expect(getInputValues()).toEqual(["by the minute", "10"]);
    expect(screen.getByText("minutes")).toBeInTheDocument();
  });

  it("shows proper single noun for minutely schedule", () => {
    setup({
      schedule: { schedule_type: "minutely", schedule_minute: 1 },
    });
    expect(getInputValues()).toEqual(["by the minute", "1"]);
    expect(screen.getByText("minute")).toBeInTheDocument();
  });

  it("shows proper plural noun for minutely schedule", () => {
    setup({
      schedule: { schedule_type: "minutely", schedule_minute: 5 },
    });
    expect(getInputValues()).toEqual(["by the minute", "5"]);
    expect(screen.getByText("minutes")).toBeInTheDocument();
  });

  it("does not allow 0 minutes option for minutely schedule", async () => {
    setup({
      schedule: { schedule_type: "minutely" },
    });

    const minuteInput = screen.getByTestId("select-minute");
    expect(minuteInput).toBeInTheDocument();

    await userEvent.click(minuteInput);

    const listbox = await screen.findByRole("listbox");
    expect(listbox).toBeInTheDocument();

    const options = within(listbox).getAllByRole("option");
    const optionValues = options.map(option => option.getAttribute("value"));

    expect(optionValues).not.toContain("0");
    expect(Math.min(...optionValues.map(Number))).toBe(1);
  });
});

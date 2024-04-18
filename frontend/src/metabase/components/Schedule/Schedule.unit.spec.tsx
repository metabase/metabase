import { screen } from "__support__/ui";
import { setup } from "metabase/components/Schedule/test-utils";

const getInputValues = () => {
  const inputs = screen.getAllByRole("searchbox");
  const values = inputs.map(input => input.getAttribute("value"));
  return values;
};

describe("Schedule", () => {
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

  it("shows first/last/mid value, day, and time when schedule is monthly", () => {
    setup({
      schedule: {
        schedule_type: "monthly",
        schedule_frame: "first",
        schedule_day: "mon",
      },
    });
    expect(getInputValues()).toEqual(["monthly", "first", "Monday", "8:00"]);
  });
});

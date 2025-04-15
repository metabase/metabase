import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import { setup } from "metabase/components/Schedule/test-utils";

const getInputValues = () => {
  const inputs = screen.getAllByRole("textbox");
  const values = inputs.map((input) => input.getAttribute("value"));
  return values;
};

describe("Schedule", () => {
  it("shows time when schedule is daily", () => {
    setup({ cronString: "0 0 8 * * ? *" });
    expect(getInputValues()).toEqual(["daily", "8:00"]);
  });

  it("shows minutes schedule is hourly and minutesOnHourPicker is true", () => {
    setup({ cronString: "0 0 * * * ? *", minutesOnHourPicker: true });
    expect(getInputValues()).toEqual(["hourly", "0"]);
    expect(screen.getByText("minutes past the hour")).toBeInTheDocument();
  });

  it("shows day and time when schedule is weekly", () => {
    setup({
      cronString: "0 0 8 ? * 2 *",
    });
    expect(getInputValues()).toEqual(["weekly", "Monday", "8:00"]);
  });

  it("shows first/last/mid value, day, and time when schedule is monthly", async () => {
    setup({
      cronString: "0 0 8 ? * 2#1 *",
    });
    expect(getInputValues()).toEqual(["monthly", "first", "Monday", "8:00"]);
  });

  it("shows 10 minutes by default for every_n_minutes schedule", () => {
    setup({
      cronString: "0 0/10 * * * ? *",
    });
    expect(getInputValues()).toEqual(["by the minute", "10"]);
    expect(screen.getByText("minutes")).toBeInTheDocument();
  });

  it("shows proper single noun for every_n_minutes schedule", () => {
    setup({
      cronString: "0 0/1 * * * ? *",
    });
    expect(getInputValues()).toEqual(["by the minute", "1"]);
    expect(screen.getByText("minute")).toBeInTheDocument();
  });

  it("shows proper plural noun for every_n_minutes schedule", () => {
    setup({
      cronString: "0 0/5 * * * ? *",
    });
    expect(getInputValues()).toEqual(["by the minute", "5"]);
    expect(screen.getByText("minutes")).toBeInTheDocument();
  });

  it("does not allow 0 minutes option for every_n_minutes schedule", async () => {
    setup({
      cronString: "0 0/10 * * * ? *",
    });

    const minuteInput = screen.getByTestId("select-minute");
    expect(minuteInput).toBeInTheDocument();

    await userEvent.click(minuteInput);

    const listbox = await screen.findByRole("listbox");
    expect(listbox).toBeInTheDocument();

    const options = within(listbox).getAllByRole("option");
    const optionValues = options.map((option) => option.getAttribute("value"));

    expect(optionValues).not.toContain("0");
    expect(Math.min(...optionValues.map(Number))).toBe(1);
  });

  it("presents 0,1,2,3,4,5,6,10,15,20,30 for every_n_minutes schedule", async () => {
    setup({
      cronString: "0 0/10 * * * ? *",
    });

    const minuteInput = screen.getByTestId("select-minute");
    expect(minuteInput).toBeInTheDocument();

    await userEvent.click(minuteInput);

    const listbox = await screen.findByRole("listbox");
    expect(listbox).toBeInTheDocument();

    const options = within(listbox).getAllByRole("option");
    const optionValues = options.map((option) => option.getAttribute("value"));

    expect(optionValues.join(",")).toEqual("1,2,3,4,5,6,10,15,20,30");
  });

  it("shows custom cron input", () => {
    setup({
      cronString: "0 0/5 * * * ? *",
      isCustomSchedule: true,
    });
    expect(getInputValues()).toEqual(["custom", "0/5 * * * ?"]);
  });
});

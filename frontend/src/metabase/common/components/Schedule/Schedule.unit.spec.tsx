import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import type { ScheduleComponentType } from "metabase/common/components/Schedule/strings";
import {
  setup,
  setupHarness,
} from "metabase/common/components/Schedule/test-utils";

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

  describe("rendered fields per frequency", () => {
    const ALL_SCHEDULE_FIELD_LABELS = [
      "Frequency",
      "First, 15th, or last of the month",
      "Day of the week",
      "Day of the month",
      "Time",
      "AM/PM",
      "Your Metabase timezone",
    ];

    it.each([
      ["hourly", "0 0 * * * ? *", ["Frequency"]],
      [
        "daily",
        "0 0 8 * * ? *",
        ["Frequency", "Time", "AM/PM", "Your Metabase timezone"],
      ],
      [
        "weekly",
        "0 0 8 ? * 2 *",
        [
          "Frequency",
          "Day of the week",
          "Time",
          "AM/PM",
          "Your Metabase timezone",
        ],
      ],
      [
        "monthly first weekday",
        "0 0 8 ? * 2#1 *",
        [
          "Frequency",
          "First, 15th, or last of the month",
          "Day of the month",
          "Time",
          "AM/PM",
          "Your Metabase timezone",
        ],
      ],
      [
        "monthly mid (15th)",
        "0 0 8 15 * ? *",
        [
          "Frequency",
          "First, 15th, or last of the month",
          "Time",
          "AM/PM",
          "Your Metabase timezone",
        ],
      ],
    ])("renders the right fields for %s", (_label, cronString, expected) => {
      setup({ cronString });
      expected.forEach((label) => {
        expect(screen.getByLabelText(label)).toBeInTheDocument();
      });
      ALL_SCHEDULE_FIELD_LABELS.filter(
        (label) => !expected.includes(label),
      ).forEach((label) => {
        expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
      });
    });
  });

  describe("write path", () => {
    const pickField = async (
      componentType: ScheduleComponentType,
      optionToClick: string,
    ) => {
      if (componentType === "amPm") {
        await userEvent.click(
          screen.getByRole("radio", { name: optionToClick }),
        );
        return;
      }
      const testIdMap: Record<
        Exclude<ScheduleComponentType, "amPm">,
        string
      > = {
        frequency: "select-frequency",
        frame: "select-frame",
        weekdayOfMonth: "select-weekday-of-month",
        weekday: "select-weekday",
        time: "select-time",
        minute: "select-minute",
      };
      const testId = testIdMap[componentType];
      await userEvent.click(screen.getByTestId(testId));
      const listbox = await screen.findByRole("listbox");
      await userEvent.click(
        within(listbox).getByRole("option", { name: optionToClick }),
      );
    };

    type WriteCase = [
      label: string,
      initialCronString: string,
      clicks: Partial<Record<ScheduleComponentType, string>>,
      expectedCron: string,
    ];

    const cases: WriteCase[] = [
      // Switching back to hourly from daily
      [
        "switch to hourly",
        "0 0 8 * * ? *",
        { frequency: "hourly" },
        "0 0 * * * ? *",
      ],
      // Daily defaults
      [
        "daily default time",
        "0 0 * * * ? *",
        { frequency: "daily" },
        "0 0 8 * * ? *",
      ],
      // Daily with explicit time/AM-PM, including 12-hour boundary
      [
        "daily 9 AM (default)",
        "0 0 * * * ? *",
        { frequency: "daily", time: "9:00" },
        "0 0 9 * * ? *",
      ],
      [
        "daily 9 PM",
        "0 0 * * * ? *",
        { frequency: "daily", time: "9:00", amPm: "PM" },
        "0 0 21 * * ? *",
      ],
      [
        "daily 12 AM",
        "0 0 * * * ? *",
        { frequency: "daily", time: "12:00", amPm: "AM" },
        "0 0 0 * * ? *",
      ],
      // Weekly across all weekdays + AM/PM boundary cases
      [
        "weekly Monday 12 AM",
        "0 0 * * * ? *",
        { frequency: "weekly", weekday: "Monday", time: "12:00", amPm: "AM" },
        "0 0 0 ? * 2 *",
      ],
      [
        "weekly Tuesday 2 AM",
        "0 0 * * * ? *",
        { frequency: "weekly", weekday: "Tuesday", time: "2:00", amPm: "AM" },
        "0 0 2 ? * 3 *",
      ],
      [
        "weekly Wednesday 4 AM",
        "0 0 * * * ? *",
        { frequency: "weekly", weekday: "Wednesday", time: "4:00", amPm: "AM" },
        "0 0 4 ? * 4 *",
      ],
      [
        "weekly Thursday 6 AM",
        "0 0 * * * ? *",
        { frequency: "weekly", weekday: "Thursday", time: "6:00", amPm: "AM" },
        "0 0 6 ? * 5 *",
      ],
      [
        "weekly Friday 8 AM",
        "0 0 * * * ? *",
        { frequency: "weekly", weekday: "Friday", time: "8:00", amPm: "AM" },
        "0 0 8 ? * 6 *",
      ],
      [
        "weekly Saturday 10 AM",
        "0 0 * * * ? *",
        { frequency: "weekly", weekday: "Saturday", time: "10:00", amPm: "AM" },
        "0 0 10 ? * 7 *",
      ],
      [
        "weekly Sunday 12 PM",
        "0 0 * * * ? *",
        { frequency: "weekly", weekday: "Sunday", time: "12:00", amPm: "PM" },
        "0 0 12 ? * 1 *",
      ],
      [
        "weekly Sunday 1 PM",
        "0 0 * * * ? *",
        { frequency: "weekly", weekday: "Sunday", time: "1:00", amPm: "PM" },
        "0 0 13 ? * 1 *",
      ],
      // Monthly variants
      [
        "monthly first Sunday 12 AM",
        "0 0 * * * ? *",
        {
          frequency: "monthly",
          frame: "first",
          weekdayOfMonth: "Sunday",
          time: "12:00",
          amPm: "AM",
        },
        "0 0 0 ? * 1#1 *",
      ],
      [
        "monthly first Monday 2 AM",
        "0 0 * * * ? *",
        {
          frequency: "monthly",
          frame: "first",
          weekdayOfMonth: "Monday",
          time: "2:00",
          amPm: "AM",
        },
        "0 0 2 ? * 2#1 *",
      ],
      [
        "monthly last Tuesday 12 AM",
        "0 0 * * * ? *",
        {
          frequency: "monthly",
          frame: "last",
          weekdayOfMonth: "Tuesday",
          time: "12:00",
          amPm: "AM",
        },
        "0 0 0 ? * 3L *",
      ],
      [
        "monthly 15th 12 AM",
        "0 0 * * * ? *",
        { frequency: "monthly", frame: "15th", time: "12:00", amPm: "AM" },
        "0 0 0 15 * ? *",
      ],
      [
        "monthly 15th 11 PM",
        "0 0 * * * ? *",
        { frequency: "monthly", frame: "15th", time: "11:00", amPm: "PM" },
        "0 0 23 15 * ? *",
      ],
      [
        "monthly first calendar day 3 PM",
        "0 0 * * * ? *",
        {
          frequency: "monthly",
          frame: "first",
          weekdayOfMonth: "calendar day",
          time: "3:00",
          amPm: "PM",
        },
        "0 0 15 1 * ? *",
      ],
    ];

    it.each(cases)(
      "%s",
      async (_label, initialCronString, clicks, expectedCron) => {
        const { onScheduleChange } = setupHarness({ initialCronString });
        for (const entry of Object.entries(clicks) as [
          ScheduleComponentType,
          string,
        ][]) {
          await pickField(entry[0], entry[1]);
        }
        expect(onScheduleChange).toHaveBeenCalled();
        expect(onScheduleChange.mock.calls.at(-1)?.[0]).toBe(expectedCron);
      },
    );
  });
});

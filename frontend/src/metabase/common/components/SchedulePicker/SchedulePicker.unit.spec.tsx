import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { SchedulePicker } from "./SchedulePicker";

const setup = ({
  timezone,
  scheduleType = "daily",
}: {
  timezone?: string;
  scheduleType?: "hourly" | "daily" | "weekly" | "monthly";
}) => {
  const onScheduleChange = jest.fn();

  const storeInitialState = createMockState({
    settings: mockSettings(
      createMockSettings({
        "application-name": "Metabase",
      }),
    ),
  });

  renderWithProviders(
    <SchedulePicker
      schedule={{
        schedule_type: scheduleType,
        schedule_hour: 8,
        schedule_day: "mon",
        schedule_frame: "first",
        schedule_minute: 0,
      }}
      scheduleOptions={["hourly", "daily", "weekly", "monthly"]}
      timezone={timezone}
      onScheduleChange={onScheduleChange}
    />,
    { storeInitialState },
  );
};

describe("SchedulePicker", () => {
  describe("timezone display", () => {
    it("shows timezone next to the time picker for daily schedules", () => {
      setup({ timezone: "EST", scheduleType: "daily" });
      expect(screen.getByText("EST")).toBeInTheDocument();
      expect(screen.getByRole("note")).toHaveAttribute(
        "aria-label",
        "Your Metabase timezone",
      );
    });

    it("shows timezone next to the time picker for weekly schedules", () => {
      setup({ timezone: "PST", scheduleType: "weekly" });
      expect(screen.getByText("PST")).toBeInTheDocument();
    });

    it("shows timezone next to the time picker for monthly schedules", () => {
      setup({ timezone: "UTC", scheduleType: "monthly" });
      expect(screen.getByText("UTC")).toBeInTheDocument();
    });

    it("does not show timezone for hourly schedules", () => {
      setup({ timezone: "EST", scheduleType: "hourly" });
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
    });

    it("does not show timezone when timezone prop is not provided", () => {
      setup({ scheduleType: "daily" });
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
    });
  });
});

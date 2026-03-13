import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";

import type { SchedulePickerProps } from "./SchedulePicker";
import { SchedulePicker } from "./SchedulePicker";

const DEFAULT_SCHEDULE_OPTIONS = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
] as const;

const setup = (props?: Partial<SchedulePickerProps>) => {
  const onScheduleChange = jest.fn();
  const defaultProps: SchedulePickerProps = {
    schedule: {
      schedule_type: "daily",
      schedule_day: null,
      schedule_frame: null,
      schedule_hour: 8,
      schedule_minute: 0,
    },
    scheduleOptions: [...DEFAULT_SCHEDULE_OPTIONS],
    onScheduleChange,
    ...props,
  };

  const { rerender } = renderWithProviders(
    <SchedulePicker {...defaultProps} />,
  );

  return {
    onScheduleChange,
    rerender: (newProps?: Partial<SchedulePickerProps>) =>
      rerender(<SchedulePicker {...defaultProps} {...newProps} />),
    props: defaultProps,
  };
};

describe("SchedulePicker", () => {
  describe("monthly schedule - schedule_frame selection", () => {
    it("should convert empty string to null when changing schedule_frame", async () => {
      const { onScheduleChange } = setup({
        schedule: {
          schedule_type: "monthly",
          schedule_frame: "first",
          schedule_day: "mon",
          schedule_hour: 8,
          schedule_minute: 0,
        },
      });

      // Find the "First" select input by display value
      const frameSelect = screen.getByDisplayValue("First");
      await userEvent.click(frameSelect);

      // Select "15th (Midpoint)" which should result in null for non-day frames
      const listbox = await screen.findByRole("listbox");
      const midOption = within(listbox).getByText("15th (Midpoint)");
      await userEvent.click(midOption);

      // Verify that onScheduleChange was called with the correct value
      expect(onScheduleChange).toHaveBeenCalledWith(
        {
          schedule_type: "monthly",
          schedule_frame: "mid",
          schedule_day: null, // Should be null when frame is "mid"
          schedule_hour: 8,
          schedule_minute: 0,
        },
        {
          name: "schedule_frame",
          value: "mid",
        },
      );
    });

    it("should handle selecting 'first' frame correctly", async () => {
      const { onScheduleChange } = setup({
        schedule: {
          schedule_type: "monthly",
          schedule_frame: "mid",
          schedule_day: null,
          schedule_hour: 8,
          schedule_minute: 0,
        },
      });

      const frameSelect = screen.getByDisplayValue("15th (Midpoint)");
      await userEvent.click(frameSelect);

      const listbox = await screen.findByRole("listbox");
      const firstOption = within(listbox).getByText("First");
      await userEvent.click(firstOption);

      expect(onScheduleChange).toHaveBeenCalledWith(
        {
          schedule_type: "monthly",
          schedule_frame: "first",
          schedule_day: "mon", // Should default to "mon" when switching to first/last
          schedule_hour: 8,
          schedule_minute: 0,
        },
        {
          name: "schedule_frame",
          value: "first",
        },
      );
    });

    it("should handle selecting 'last' frame correctly", async () => {
      const { onScheduleChange } = setup({
        schedule: {
          schedule_type: "monthly",
          schedule_frame: "mid",
          schedule_day: null,
          schedule_hour: 8,
          schedule_minute: 0,
        },
      });

      const frameSelect = screen.getByDisplayValue("15th (Midpoint)");
      await userEvent.click(frameSelect);

      const listbox = await screen.findByRole("listbox");
      const lastOption = within(listbox).getByText("Last");
      await userEvent.click(lastOption);

      expect(onScheduleChange).toHaveBeenCalledWith(
        {
          schedule_type: "monthly",
          schedule_frame: "last",
          schedule_day: "mon",
          schedule_hour: 8,
          schedule_minute: 0,
        },
        {
          name: "schedule_frame",
          value: "last",
        },
      );
    });
  });

  describe("monthly schedule - schedule_day selection (Calendar Day)", () => {
    it("should convert empty string to null when selecting 'Calendar Day'", async () => {
      const { onScheduleChange } = setup({
        schedule: {
          schedule_type: "monthly",
          schedule_frame: "first",
          schedule_day: "mon",
          schedule_hour: 8,
          schedule_minute: 0,
        },
      });

      // Find the "Monday" select input
      const daySelect = screen.getByDisplayValue("Monday");
      await userEvent.click(daySelect);

      // Select "Calendar Day" which has an empty string value
      const listbox = await screen.findByRole("listbox");
      const calendarDayOption = within(listbox).getByText("Calendar Day");
      await userEvent.click(calendarDayOption);

      // Verify that onScheduleChange was called with null, not "" because Mantine Select uses ""
      expect(onScheduleChange).toHaveBeenCalledWith(
        {
          schedule_type: "monthly",
          schedule_frame: "first",
          schedule_day: null,
          schedule_hour: 8,
          schedule_minute: 0,
        },
        {
          name: "schedule_day",
          value: null,
        },
      );
    });

    it("should handle selecting a specific weekday correctly", async () => {
      const { onScheduleChange } = setup({
        schedule: {
          schedule_type: "monthly",
          schedule_frame: "first",
          schedule_day: null,
          schedule_hour: 8,
          schedule_minute: 0,
        },
      });

      // When schedule_day is null, it displays as "Calendar Day"
      const daySelect = screen.getByDisplayValue("Calendar Day");
      await userEvent.click(daySelect);

      // Select a specific weekday
      const listbox = await screen.findByRole("listbox");
      const wednesdayOption = within(listbox).getByText("Wednesday");
      await userEvent.click(wednesdayOption);

      expect(onScheduleChange).toHaveBeenCalledWith(
        {
          schedule_type: "monthly",
          schedule_frame: "first",
          schedule_day: "wed",
          schedule_hour: 8,
          schedule_minute: 0,
        },
        {
          name: "schedule_day",
          value: "wed",
        },
      );
    });
  });

  describe("monthly schedule - day picker visibility", () => {
    it("should hide day picker when schedule_frame is 'mid'", () => {
      setup({
        schedule: {
          schedule_type: "monthly",
          schedule_frame: "mid",
          schedule_day: null,
          schedule_hour: 8,
          schedule_minute: 0,
        },
      });

      // Should have "on the" text
      expect(screen.getByText("on the")).toBeInTheDocument();

      // Should have the "15th (Midpoint)" select
      expect(screen.getByDisplayValue("15th (Midpoint)")).toBeInTheDocument();

      // Verify that there's no "Calendar Day" or weekday option visible
      // (the day picker is not rendered when frame is "mid")
      expect(
        screen.queryByDisplayValue("Calendar Day"),
      ).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue("Monday")).not.toBeInTheDocument();
    });

    it("should show day picker when schedule_frame is 'first'", () => {
      setup({
        schedule: {
          schedule_type: "monthly",
          schedule_frame: "first",
          schedule_day: "mon",
          schedule_hour: 8,
          schedule_minute: 0,
        },
      });

      // When frame is "first", day picker should be visible
      expect(screen.getByDisplayValue("First")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Monday")).toBeInTheDocument();
      expect(screen.getByText("on the")).toBeInTheDocument();
    });

    it("should show day picker when schedule_frame is 'last'", () => {
      setup({
        schedule: {
          schedule_type: "monthly",
          schedule_frame: "last",
          schedule_day: "fri",
          schedule_hour: 8,
          schedule_minute: 0,
        },
      });

      expect(screen.getByDisplayValue("Last")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Friday")).toBeInTheDocument();
      expect(screen.getByText("on the")).toBeInTheDocument();
    });
  });

  describe("weekly schedule - schedule_day selection", () => {
    it("should handle selecting a weekday correctly", async () => {
      const { onScheduleChange } = setup({
        schedule: {
          schedule_type: "weekly",
          schedule_day: "mon",
          schedule_frame: null,
          schedule_hour: 8,
          schedule_minute: 0,
        },
      });

      // Find the "Monday" select in weekly view
      const daySelect = screen.getByDisplayValue("Monday");
      await userEvent.click(daySelect);

      const listbox = await screen.findByRole("listbox");
      const fridayOption = within(listbox).getByText("Friday");
      await userEvent.click(fridayOption);

      // Verify the day was changed correctly
      expect(onScheduleChange).toHaveBeenCalledWith(
        {
          schedule_type: "weekly",
          schedule_day: "fri",
          schedule_frame: null,
          schedule_hour: 8,
          schedule_minute: 0,
        },
        {
          name: "schedule_day",
          value: "fri",
        },
      );
    });
  });

  describe("schedule type changes", () => {
    it("should clear frame and day when switching to daily", async () => {
      const { onScheduleChange } = setup({
        schedule: {
          schedule_type: "monthly",
          schedule_frame: "first",
          schedule_day: "mon",
          schedule_hour: 8,
          schedule_minute: 0,
        },
      });

      const typeSelect = screen.getByDisplayValue("Monthly");
      await userEvent.click(typeSelect);

      const listbox = await screen.findByRole("listbox");
      const dailyOption = within(listbox).getByText("Daily");
      await userEvent.click(dailyOption);

      expect(onScheduleChange).toHaveBeenCalledWith(
        {
          schedule_type: "daily",
          schedule_day: null,
          schedule_frame: null,
          schedule_hour: 8,
          schedule_minute: 0,
        },
        {
          name: "schedule_type",
          value: "daily",
        },
      );
    });

    it("should set default day and clear frame when switching to weekly", async () => {
      const { onScheduleChange } = setup({
        schedule: {
          schedule_type: "daily",
          schedule_day: null,
          schedule_frame: null,
          schedule_hour: 8,
          schedule_minute: 0,
        },
      });

      const typeSelect = screen.getByDisplayValue("Daily");
      await userEvent.click(typeSelect);

      const listbox = await screen.findByRole("listbox");
      const weeklyOption = within(listbox).getByText("Weekly");
      await userEvent.click(weeklyOption);

      expect(onScheduleChange).toHaveBeenCalledWith(
        {
          schedule_type: "weekly",
          schedule_day: "mon",
          schedule_frame: null,
          schedule_hour: 8,
          schedule_minute: 0,
        },
        {
          name: "schedule_type",
          value: "weekly",
        },
      );
    });

    it("should set default values when switching to monthly", async () => {
      const { onScheduleChange } = setup({
        schedule: {
          schedule_type: "daily",
          schedule_day: null,
          schedule_frame: null,
          schedule_hour: 8,
          schedule_minute: 0,
        },
      });

      // Find and click the "Daily" select
      const typeSelect = screen.getByDisplayValue("Daily");
      await userEvent.click(typeSelect);

      const listbox = await screen.findByRole("listbox");
      const monthlyOption = within(listbox).getByText("Monthly");
      await userEvent.click(monthlyOption);

      expect(onScheduleChange).toHaveBeenCalledWith(
        {
          schedule_type: "monthly",
          schedule_frame: "first",
          schedule_day: "mon",
          schedule_hour: 8,
          schedule_minute: 0,
        },
        {
          name: "schedule_type",
          value: "monthly",
        },
      );
    });
  });
});

import {
  type GetScheduleTextProps,
  getScheduleText,
} from "./get-schedule-text";

const setup = ({
  schedule = {},
  verbose = false,
}: Partial<GetScheduleTextProps> = {}) => {
  return getScheduleText({ schedule, verbose });
};

describe("getScheduleText", () => {
  describe("when schedule type is not provided", () => {
    it("should return null when verbose is false", () => {
      const result = setup();
      expect(result).toBeNull();
    });

    it("should return null when verbose is true", () => {
      const result = setup({ verbose: true });
      expect(result).toBeNull();
    });
  });

  describe('when schedule type is "hourly"', () => {
    it('should return "Hourly" when verbose is false', () => {
      const result = setup({
        schedule: { schedule_type: "hourly" },
      });
      expect(result).toBe("Hourly");
    });

    it('should return "hourly" when verbose is true', () => {
      const result = setup({
        schedule: { schedule_type: "hourly" },
        verbose: true,
      });
      expect(result).toBe("hourly");
    });
  });

  describe('when schedule type is "daily"', () => {
    it('should return "Daily, 9:00 AM" when verbose is false', () => {
      const result = setup({
        schedule: { schedule_type: "daily", schedule_hour: 9 },
      });
      expect(result).toBe("Daily, 9:00 AM");
    });

    it('should return "daily at 9:00 AM" when verbose is true', () => {
      const result = setup({
        schedule: { schedule_type: "daily", schedule_hour: 9 },
        verbose: true,
      });
      expect(result).toBe("daily at 9:00 AM");
    });
  });

  describe('when schedule type is "weekly"', () => {
    it('should return "Tuesdays, 3:00 PM" when verbose is false', () => {
      const result = setup({
        schedule: {
          schedule_type: "weekly",
          schedule_day: "tue",
          schedule_hour: 15,
        },
      });
      expect(result).toBe("Tuesdays, 3 PM");
    });

    it('should return "weekly on Tuesdays at 3:00 PM" when verbose is true', () => {
      const result = setup({
        schedule: {
          schedule_type: "weekly",
          schedule_day: "tue",
          schedule_hour: 15,
        },
        verbose: true,
      });
      expect(result).toBe("weekly on Tuesdays at 3:00 PM");
    });
  });

  describe("when hour of day is not provided", () => {
    it("should return null when verbose is false", () => {
      const result = setup({
        schedule: { schedule_type: "daily" },
      });
      expect(result).toBeNull();
    });

    it("should return null when verbose is true", () => {
      const result = setup({
        schedule: { schedule_type: "daily" },
        verbose: true,
      });
      expect(result).toBeNull();
    });
  });
});

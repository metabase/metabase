import { createMockDatabase } from "metabase-types/api/mocks/database";
import { getHelpText } from "./helper-text-strings";

describe("getHelpText", () => {
  const database = createMockDatabase();
  const reportTimezone = "US/Hawaii";

  it("should be undefined if an unsupported function name is passed", () => {
    const helpText = getHelpText(
      "this function name should not ever exist",
      database,
      reportTimezone,
    );

    expect(helpText).toBeUndefined();
  });

  it("should return help text if a supported name is passed", () => {
    const helpText = getHelpText("count", database, reportTimezone);

    expect(helpText?.structure).toBe("Count");
    expect(helpText?.example).toBe("Count");
    expect(helpText?.description).toMatch(/returns the count of rows/i);
    expect(helpText?.args).toHaveLength(0);
  });

  describe("help texts customized per database engine", () => {
    it("should include timestamps in description for default database engines", () => {
      const helpText = getHelpText("now", database, reportTimezone);

      expect(helpText?.description).toMatch(/currently/i);
    });

    it("should not include timestamps in description for h2 database engines", () => {
      const h2Database = { ...database, engine: "h2" };
      const helpText = getHelpText("now", h2Database, reportTimezone);

      expect(helpText?.description).not.toMatch(/currently/i);
    });

    it("should use custom reportTimezone in description for supporting database engines", () => {
      const helpText = getHelpText(
        "now",
        { ...database, features: ["set-timezone"] },
        reportTimezone,
      );

      expect(helpText?.description).toMatch(new RegExp(reportTimezone));
    });

    it("should default to UTC in description for database engines not supporting set-timezone", () => {
      const helpText = getHelpText("now", database, reportTimezone);

      expect(helpText?.description).toMatch(/UTC/);
    });
  });
});

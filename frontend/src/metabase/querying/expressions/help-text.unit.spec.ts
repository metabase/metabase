import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks/database";

import { MBQL_CLAUSES } from "./config";
import { formatExpressionParts } from "./formatter";
import { getHelpText } from "./help-text";

describe("getHelpText", () => {
  const reportTimezone = "US/Hawaii";

  it("should be undefined if an unsupported function name is passed", () => {
    const { database } = setup();
    const helpText = getHelpText(
      "this function name should not ever exist",
      database,
      reportTimezone,
    );

    expect(helpText).toBeNull();
  });

  describe("should return help text if a supported name is passed", () => {
    it("count", () => {
      const { database } = setup();
      const helpText = getHelpText("count", database, reportTimezone);

      expect(helpText?.displayName).toBe("Count");
      expect(helpText?.example).toEqual({
        operator: "count",
        options: {},
        args: [],
      });
      expect(helpText?.description).toMatch(/returns the count of rows/i);
      expect(helpText?.args).toEqual([]);
    });

    it("percentile", () => {
      const { database } = setup();
      const helpText = getHelpText("percentile", database, reportTimezone);

      expect(helpText?.displayName).toBe("Percentile");
      expect(helpText?.example).toEqual({
        operator: "percentile",
        options: {},
        args: [
          {
            operator: "dimension",
            options: {},
            args: ["Score"],
          },
          0.9,
        ],
      });
      expect(helpText?.description).toBe(
        "Returns the value of the column at the percentile value.",
      );
      expect(helpText?.args).toHaveLength(2);
    });

    it("convertTimezone", () => {
      const { database } = setup();
      const helpText = getHelpText(
        "convert-timezone",
        database,
        reportTimezone,
      );

      expect(helpText?.displayName).toEqual("convertTimezone");
      expect(helpText?.description).toEqual(
        expect.not.stringContaining("https"),
      );
    });

    it("offset", async () => {
      const { database } = setup();
      const helpText = getHelpText("offset", database, reportTimezone);

      expect(helpText?.displayName).toBe("Offset");
      expect(helpText?.example).toEqual({
        operator: "offset",
        options: {},
        args: [
          {
            operator: "sum",
            options: {},
            args: [
              {
                operator: "dimension",
                options: {},
                args: ["Total"],
              },
            ],
          },
          -1,
        ],
      });
      if (!helpText?.example) {
        throw new Error("unreachable");
      }
      expect(await formatExpressionParts(helpText?.example)).toEqual(
        "Offset(Sum([Total]), -1)",
      );
    });

    describe("datetimeDiff", () => {
      it("should not mention milliseconds in the unit description", () => {
        const { database } = setup();
        const helpText = checkNotNull(
          getHelpText("datetime-diff", database, reportTimezone),
        );
        const unitArg = checkNotNull(
          helpText.args?.find((arg) => arg.name === "unit"),
        );
        expect(unitArg.description).toContain("second");
        expect(unitArg.description).not.toContain("millisecond");
      });
    });
  });

  describe("help texts customized per database engine", () => {
    it("should include timestamps in description for default database engines", () => {
      const { database } = setup();
      const helpText = getHelpText("now", database, reportTimezone);

      expect(helpText?.description).toMatch("Currently");
    });

    it("should not include timestamps in description for h2 database engines", () => {
      const { database } = setup({ engine: "h2" });
      const helpText = getHelpText("now", database, reportTimezone);

      expect(helpText?.description).not.toMatch("Currently");
    });

    it("should use custom reportTimezone in description for supporting database engines", () => {
      const { database } = setup({ features: ["set-timezone"] });
      const helpText = getHelpText("now", database, reportTimezone);

      expect(helpText?.description).toMatch(reportTimezone);
    });

    it("should default to UTC in description for database engines not supporting set-timezone", () => {
      const { database } = setup();
      const helpText = getHelpText("now", database, reportTimezone);

      expect(helpText?.description).toMatch("UTC");
    });
  });

  it("all help texts can be formatted", async () => {
    for (const name in MBQL_CLAUSES) {
      const { database } = setup();
      const helpText = getHelpText(name, database, reportTimezone);
      if (!helpText) {
        continue;
      }
      expect(() => formatExpressionParts(helpText.example)).not.toThrow();
    }
  });
});

function setup(dbOpts?: Partial<Database>) {
  const database = createMockDatabase(dbOpts);
  const metadata = createMockMetadata({ databases: [database] });
  const instance = metadata.database(database.id);
  if (!instance) {
    throw new TypeError();
  }

  return { database: instance };
}

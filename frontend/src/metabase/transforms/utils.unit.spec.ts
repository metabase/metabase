import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { parseTimestampWithTimezone, validateDatabase } from "./utils";

describe("parseTimestamp", () => {
  const value = "2025-09-04T16:25:03.000Z";

  it.each([
    { timezone: "UTC", utcOffset: 0 },
    { timezone: undefined, utcOffset: 0 },
    { timezone: "Wrong", utcOffset: 0 },
    { timezone: "America/Toronto", utcOffset: -240 },
  ])(
    "should parse a timestamp with a timezone $timezone",
    ({ timezone, utcOffset }) => {
      const date = parseTimestampWithTimezone(value, timezone);
      expect(date.toISOString()).toBe(value);
      expect(date.utcOffset()).toBe(utcOffset);
    },
  );
});

describe("validateDatabase", () => {
  it.each<{
    label: string;
    database: Database;
    isValid: boolean;
    message?: string;
  }>([
    {
      label: "valid database",
      database: createMockDatabase({ features: ["transforms/table"] }),
      isValid: true,
    },
    {
      label: "sample database",
      database: createMockDatabase({
        is_sample: true,
        features: ["transforms/table"],
      }),
      isValid: false,
      message: "Transforms can't be enabled on the Sample Database.",
    },
    {
      label: "audit database",
      database: createMockDatabase({
        is_audit: true,
        features: ["transforms/table"],
      }),
      isValid: false,
      message: "Transforms can't be enabled on the Usage Analytics database.",
    },
    {
      label: "database with router_user_attribute",
      database: createMockDatabase({
        router_user_attribute: "attr",
        features: ["transforms/table"],
      }),
      isValid: false,
      message: "Transforms can't be enabled when database routing is enabled.",
    },
    {
      label: "database with router_database_id",
      database: createMockDatabase({
        router_database_id: 2,
        features: ["transforms/table"],
      }),
      isValid: false,
      message: "Transforms can't be enabled when database routing is enabled.",
    },
    {
      label: "database without transforms/table feature",
      database: createMockDatabase({ features: [] }),
      isValid: false,
      message: "Transforms can't be enabled on this database.",
    },
  ])("should validate $label", ({ database, isValid, message }) => {
    const result = validateDatabase(database);
    expect(result.isValid).toBe(isValid);
    expect(result.message).toBe(message);
  });
});

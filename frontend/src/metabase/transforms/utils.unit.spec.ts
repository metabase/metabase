import { createMockDatabase } from "metabase-types/api/mocks";

import {
  getDatabaseTransformDisabledReason,
  parseTimestampWithTimezone,
} from "./utils";

describe("getDatabaseTransformDisabledReason", () => {
  it("returns undefined when database is undefined", () => {
    expect(getDatabaseTransformDisabledReason(undefined)).toBeUndefined();
  });

  it("returns a reason when the database has router_user_attribute set (DB routing enabled)", () => {
    const database = createMockDatabase({ router_user_attribute: "user_id" });
    expect(getDatabaseTransformDisabledReason(database)).toBe(
      "Transforms can't be created on databases with DB routing enabled",
    );
  });

  it("returns a reason when the database has router_database_id set (is a routing destination)", () => {
    const database = createMockDatabase({ router_database_id: 42 });
    expect(getDatabaseTransformDisabledReason(database)).toBe(
      "Transforms can't be created on databases with DB routing enabled",
    );
  });

  it("returns undefined for a regular database without DB routing", () => {
    const database = createMockDatabase({
      router_user_attribute: null,
      router_database_id: null,
    });
    expect(getDatabaseTransformDisabledReason(database)).toBeUndefined();
  });

  it("returns undefined for a sample database (no DB routing)", () => {
    const database = createMockDatabase({ is_sample: true });
    expect(getDatabaseTransformDisabledReason(database)).toBeUndefined();
  });
});

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

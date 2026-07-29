import type { Engine } from "metabase-types/api";
import { createMockDatabaseData } from "metabase-types/api/mocks";

import { mergeRetainedValues } from "./utils";

const ENGINE: Engine = {
  source: { type: "official", contact: null },
  "driver-name": "PostgreSQL",
  "superseded-by": null,
  "extra-info": null,
  "details-fields": [
    { name: "host" },
    { name: "port", type: "integer" },
    { name: "ssl", type: "boolean" },
    { name: "region", type: "select" },
    { name: "is-destination-database", type: "hidden" },
  ],
};

const DEFAULT_VALUES = {
  ...createMockDatabaseData({
    engine: "postgres",
    name: "",
    details: {
      host: null,
      port: null,
      ssl: false,
      region: null,
      "is-destination-database": false,
    },
  }),
  "connection-string": "",
  provider_name: null,
};

describe("mergeRetainedValues", () => {
  it("should keep the details that the engine declares with the same type", () => {
    const previousValues = createMockDatabaseData({
      engine: "mysql",
      name: "My database",
      details: {
        host: "localhost",
        port: 5432,
        ssl: true,
        region: "us-east-1",
      },
    });

    expect(
      mergeRetainedValues(previousValues, DEFAULT_VALUES, ENGINE),
    ).toMatchObject({
      name: "My database",
      details: {
        host: "localhost",
        port: 5432,
        ssl: true,
        region: "us-east-1",
      },
    });
  });

  it("should discard the details that the engine does not declare", () => {
    const previousValues = createMockDatabaseData({
      details: { host: "localhost", dbname: "birds" },
    });

    const { details } = mergeRetainedValues(
      previousValues,
      DEFAULT_VALUES,
      ENGINE,
    );

    expect(details).toHaveProperty("host", "localhost");
    expect(details).not.toHaveProperty("dbname");
  });

  it("should fall back to the default when the engine declares another type", () => {
    const previousValues = createMockDatabaseData({
      details: { host: 5432, port: "5432", ssl: "yes" },
    });

    expect(
      mergeRetainedValues(previousValues, DEFAULT_VALUES, ENGINE).details,
    ).toEqual(DEFAULT_VALUES.details);
  });

  it("should not carry over hidden details, which the engine controls", () => {
    const previousValues = createMockDatabaseData({
      details: { "is-destination-database": true },
    });

    expect(
      mergeRetainedValues(previousValues, DEFAULT_VALUES, ENGINE).details,
    ).toHaveProperty("is-destination-database", false);
  });

  it("should reset the values that describe the engine that was selected", () => {
    const previousValues = {
      ...createMockDatabaseData({ engine: "mysql" }),
      "connection-string": "jdbc:mysql://localhost:3306/birds",
      provider_name: "Neon",
    };

    expect(mergeRetainedValues(previousValues, DEFAULT_VALUES, ENGINE)).toEqual(
      expect.objectContaining({
        engine: "postgres",
        "connection-string": "",
        provider_name: null,
      }),
    );
  });

  it("should fall back to the defaults when there is no engine to check against", () => {
    const previousValues = createMockDatabaseData({
      details: { host: "localhost" },
    });

    expect(
      mergeRetainedValues(previousValues, DEFAULT_VALUES, undefined).details,
    ).toEqual(DEFAULT_VALUES.details);
  });
});

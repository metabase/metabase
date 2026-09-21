import {
  createMockTransform,
  createMockTransformSource,
} from "metabase-types/api/mocks";

import {
  type IncrementalSettingsFormValues,
  VALIDATION_SCHEMA,
  buildIncrementalSource,
  buildIncrementalTarget,
  getIncrementalSettingsFromTransform,
} from "./form";

const getValues = (
  values: Partial<IncrementalSettingsFormValues> = {},
): IncrementalSettingsFormValues => ({
  incremental: true,
  sourceStrategy: "checkpoint",
  checkpointFilterFieldId: "123",
  uniqueKey: "",
  lookbackValue: null,
  lookbackUnit: "day",
  ...values,
});

const BASE_TARGET = { name: "orders_latest", schema: "public", database: 1 };

describe("IncrementalTransform form validation", () => {
  it("requires checkpoint field for incremental transforms", async () => {
    const values = getValues({ checkpointFilterFieldId: null });

    await expect(VALIDATION_SCHEMA.validate(values)).rejects.toMatchObject({
      message: "required",
    });
  });

  it("accepts checkpoint field when incremental transforms are enabled", async () => {
    const values = getValues({ checkpointFilterFieldId: "42" });

    await expect(VALIDATION_SCHEMA.validate(values)).resolves.toEqual(values);
  });

  it("does not require checkpoint field when incremental transforms are disabled", async () => {
    const values = getValues({
      incremental: false,
      checkpointFilterFieldId: null,
    });

    await expect(VALIDATION_SCHEMA.validate(values)).resolves.toEqual(values);
  });
});

describe("buildIncrementalTarget (merge)", () => {
  it("produces an append target when no unique key is set", () => {
    const target = buildIncrementalTarget(
      BASE_TARGET,
      getValues({ uniqueKey: "" }),
    );
    expect(target).toMatchObject({
      type: "table-incremental",
      "target-incremental-strategy": { type: "append" },
    });
  });

  it("produces a merge target keyed on the unique key column", () => {
    const target = buildIncrementalTarget(
      BASE_TARGET,
      getValues({ uniqueKey: "order_id" }),
    );
    expect(target).toMatchObject({
      type: "table-incremental",
      "target-incremental-strategy": {
        type: "merge",
        "unique-key": [{ name: "order_id" }],
      },
    });
  });

  it("splits a comma-separated unique key and trims whitespace", () => {
    const target = buildIncrementalTarget(
      BASE_TARGET,
      getValues({ uniqueKey: " order_id , region " }),
    );
    expect(target).toMatchObject({
      "target-incremental-strategy": {
        type: "merge",
        "unique-key": [{ name: "order_id" }, { name: "region" }],
      },
    });
  });

  it("produces a plain table target when incremental is off", () => {
    const target = buildIncrementalTarget(
      BASE_TARGET,
      getValues({ incremental: false, uniqueKey: "order_id" }),
    );
    expect(target.type).toBe("table");
  });
});

describe("buildIncrementalSource (lookback)", () => {
  it("omits lookback when no value is set", () => {
    const source = buildIncrementalSource(
      createMockTransformSource(),
      getValues(),
    );
    expect(source["source-incremental-strategy"]?.lookback).toBeUndefined();
  });

  it("includes value and unit when a lookback is set", () => {
    const source = buildIncrementalSource(
      createMockTransformSource(),
      getValues({ lookbackValue: 4, lookbackUnit: "week" }),
    );
    expect(source["source-incremental-strategy"]?.lookback).toEqual({
      value: 4,
      unit: "week",
    });
  });
});

describe("getIncrementalSettingsFromTransform (lookback)", () => {
  it("reads the lookback into form values", () => {
    const transform = createMockTransform({
      source: {
        ...createMockTransformSource(),
        "source-incremental-strategy": {
          type: "checkpoint",
          "checkpoint-filter-field-id": 123,
          lookback: { value: 4, unit: "day" },
        },
      },
      target: {
        type: "table-incremental",
        name: "t",
        schema: "public",
        database: 1,
        "target-incremental-strategy": { type: "append" },
      },
    });
    expect(getIncrementalSettingsFromTransform(transform)).toMatchObject({
      incremental: true,
      checkpointFilterFieldId: "123",
      lookbackValue: 4,
      lookbackUnit: "day",
    });
  });

  it("defaults to no lookback when the strategy has none", () => {
    const transform = createMockTransform();
    expect(getIncrementalSettingsFromTransform(transform)).toMatchObject({
      lookbackValue: null,
      lookbackUnit: "day",
    });
  });
});

describe("getIncrementalSettingsFromTransform (merge)", () => {
  it("reads the merge unique key into a comma-separated string", () => {
    const transform = createMockTransform({
      target: {
        type: "table-incremental",
        name: "t",
        schema: "public",
        database: 1,
        "target-incremental-strategy": {
          type: "merge",
          "unique-key": [{ name: "order_id" }, { name: "region" }],
        },
      },
    });
    expect(getIncrementalSettingsFromTransform(transform)).toMatchObject({
      incremental: true,
      uniqueKey: "order_id, region",
    });
  });

  it("leaves the unique key empty for an append target", () => {
    const transform = createMockTransform({
      target: {
        type: "table-incremental",
        name: "t",
        schema: "public",
        database: 1,
        "target-incremental-strategy": { type: "append" },
      },
    });
    expect(getIncrementalSettingsFromTransform(transform).uniqueKey).toBe("");
  });
});

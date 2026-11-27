import type { CompleteSettingDefinitions } from "../types";

import {
  getLineAreaBarComparisonSettings,
  getTypedComputedSettings,
} from "./settings";

type Context = { units: string[] };

type Settings = {
  unit: string;
  label: string;
};

// `label` comes first, so `unit` is computed first only because `label`
// depends on it.
const SETTINGS: CompleteSettingDefinitions<Context, Settings> = {
  label: {
    getDefault: (_context, settings) => `per ${settings.unit}`,
    isValid: (_context, settings) => typeof settings.label === "string",
    readDependencies: ["unit"],
  },
  unit: {
    getDefault: ({ units }) => units[0],
    isValid: ({ units }, settings) =>
      typeof settings.unit === "string" && units.includes(settings.unit),
  },
};

const CONTEXT: Context = { units: ["day", "week"] };

describe("getTypedComputedSettings", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses the defaults when nothing is stored", () => {
    expect(getTypedComputedSettings(SETTINGS, CONTEXT, {})).toEqual({
      unit: "day",
      label: "per day",
    });
  });

  it("keeps stored values that pass `isValid`", () => {
    expect(
      getTypedComputedSettings(SETTINGS, CONTEXT, {
        unit: "week",
        label: "weekly",
      }),
    ).toEqual({ unit: "week", label: "weekly" });
  });

  it("falls back to the default for stored values that fail `isValid`", () => {
    expect(
      getTypedComputedSettings(SETTINGS, CONTEXT, { unit: "year", label: 1 }),
    ).toEqual({ unit: "day", label: "per day" });
  });

  it("checks stored values against the object", () => {
    expect(
      getTypedComputedSettings(SETTINGS, { units: ["month"] }, { unit: "day" }),
    ).toEqual({ unit: "month", label: "per month" });
  });

  it("computes read dependencies first, from their validated values", () => {
    expect(
      getTypedComputedSettings(SETTINGS, CONTEXT, { unit: "week" }),
    ).toEqual({ unit: "week", label: "per week" });
    expect(
      getTypedComputedSettings(SETTINGS, CONTEXT, { unit: "year" }),
    ).toEqual({ unit: "day", label: "per day" });
  });

  it("types each definition by its setting", () => {
    const definitions: CompleteSettingDefinitions<Context, Settings> = {
      // @ts-expect-error every setting needs a default
      unit: {
        isValid: (_context, settings) =>
          // @ts-expect-error the stored value isn't validated yet
          settings.unit.length > 0,
      },
      // @ts-expect-error every setting needs to check stored values
      label: { getDefault: () => "label" },
    };
    const otherDefinitions: CompleteSettingDefinitions<Context, Settings> = {
      unit: {
        getDefault: () => "day",
        isValid: () => true,
        // @ts-expect-error a setting can't depend on itself
        readDependencies: ["unit"],
      },
      label: {
        // @ts-expect-error the default must have the setting's type
        getDefault: () => 1,
        isValid: () => true,
      },
    };
    expect([definitions, otherDefinitions]).toHaveLength(2);
  });

  it("throws when a definition throws, rather than leaving a setting unset", () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const definitions: CompleteSettingDefinitions<Context, Settings> = {
      ...SETTINGS,
      label: {
        getDefault: () => {
          throw new Error("no label");
        },
        isValid: () => true,
      },
    };
    expect(() => getTypedComputedSettings(definitions, CONTEXT, {})).toThrow(
      'Setting "label" has no value',
    );
  });

  it("only defines settings whose values can't be undefined", () => {
    const definitions: CompleteSettingDefinitions<
      Context,
      { label: string | undefined }
    > = {
      // @ts-expect-error a missing value would look like a definition that threw
      label: { getDefault: () => "label", isValid: () => true },
    };
    expect(Object.keys(definitions)).toEqual(["label"]);
  });

  it("ignores stored keys without a definition", () => {
    expect(
      getTypedComputedSettings(SETTINGS, CONTEXT, { other: "value" }),
    ).toEqual({ unit: "day", label: "per day" });
  });
});

describe("getLineAreaBarComparisonSettings", () => {
  it("compares duration settings, so series in different units do not share axis", () => {
    const seconds = getLineAreaBarComparisonSettings({
      number_style: "duration",
      duration_unit: "second",
      column_title: "Seconds",
    });
    const minutes = getLineAreaBarComparisonSettings({
      number_style: "duration",
      duration_unit: "minute",
      column_title: "Minutes",
    });

    expect(seconds).toEqual({
      number_style: "duration",
      duration_unit: "second",
    });
    expect(minutes).not.toEqual(seconds);
  });
});

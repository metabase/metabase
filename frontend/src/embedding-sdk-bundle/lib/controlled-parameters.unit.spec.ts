import type { UiParameter } from "metabase-lib/v1/parameters/types";

import {
  buildControlledParameters,
  buildParametersPayload,
  getEffectiveParameterValues,
  mapExplicitNullToEmpty,
} from "./controlled-parameters";

const STATE_PARAM = {
  id: "p1",
  slug: "state",
  name: "State",
  type: "string/=",
  default: "AR",
  target: ["variable", ["template-tag", "state"]],
} as unknown as UiParameter;

const CATEGORY_PARAM = {
  id: "p2",
  slug: "category",
  name: "Category",
  type: "string/=",
  // No default — falls back to `null`.
  target: ["variable", ["template-tag", "category"]],
} as unknown as UiParameter;

const DEFAULT_DEFINITIONS: UiParameter[] = [STATE_PARAM, CATEGORY_PARAM];

describe("mapExplicitNullToEmpty", () => {
  it('maps explicit `null` values to `""`', () => {
    expect(mapExplicitNullToEmpty({ state: null, category: null })).toEqual({
      state: "",
      category: "",
    });
  });

  it("preserves non-null values as-is", () => {
    expect(
      mapExplicitNullToEmpty({ state: "NY", count: 3, flags: ["a", "b"] }),
    ).toEqual({ state: "NY", count: 3, flags: ["a", "b"] });
  });

  it("returns an empty object for an empty input", () => {
    expect(mapExplicitNullToEmpty({})).toEqual({});
  });

  it('maps `null` to `""` and preserves non-null values when both appear in the same object', () => {
    expect(
      mapExplicitNullToEmpty({
        state: null,
        category: "Foo",
        count: 3,
        flags: ["a", "b"],
      }),
    ).toEqual({
      state: "",
      category: "Foo",
      count: 3,
      flags: ["a", "b"],
    });
  });
});

describe("buildControlledParameters", () => {
  it("maps slug-keyed values to id-keyed and parses each value", () => {
    const result = buildControlledParameters(
      { state: "NY" },
      DEFAULT_DEFINITIONS,
    );

    expect(result).toEqual({
      [STATE_PARAM.id]: ["NY"],
      [CATEGORY_PARAM.id]: null,
    });
  });

  it("falls back to `parameter.default` for missing slugs", () => {
    const result = buildControlledParameters(
      { state: "NY" },
      DEFAULT_DEFINITIONS,
    );

    expect(result).toEqual({
      [STATE_PARAM.id]: ["NY"],
      [CATEGORY_PARAM.id]: null,
    });
  });

  it("treats explicit `null` as a strict clear and ignores `parameter.default`", () => {
    const result = buildControlledParameters(
      { state: null },
      DEFAULT_DEFINITIONS,
    );

    expect(result).toEqual({
      [STATE_PARAM.id]: null,
      [CATEGORY_PARAM.id]: null,
    });
  });

  it("returns `parameter.default ?? null` for every slug when given an empty object", () => {
    const result = buildControlledParameters({}, DEFAULT_DEFINITIONS);

    expect(result).toEqual({
      [STATE_PARAM.id]: "AR",
      [CATEGORY_PARAM.id]: null,
    });
  });

  describe("controlled-parameters value normalization round-trip", () => {
    it("wraps a single-value string push into an array (matches widget storage shape)", () => {
      // Host pushes a bare string for an array-like parameter.
      const pushed = buildControlledParameters(
        { state: "Gizmo" },
        DEFAULT_DEFINITIONS,
      );

      expect(pushed).toEqual({
        [STATE_PARAM.id]: ["Gizmo"],
        [CATEGORY_PARAM.id]: null,
      });
    });

    it("preserves an array push unchanged (no double-wrap)", () => {
      const pushed = buildControlledParameters(
        { state: ["Gizmo", "Widget"] },
        DEFAULT_DEFINITIONS,
      );

      expect(pushed).toEqual({
        [STATE_PARAM.id]: ["Gizmo", "Widget"],
        [CATEGORY_PARAM.id]: null,
      });
    });

    it("emits the normalized array shape back to the host", () => {
      const applied = buildControlledParameters(
        { state: "Gizmo" },
        DEFAULT_DEFINITIONS,
      );

      const payload = buildParametersPayload(applied, DEFAULT_DEFINITIONS);

      // Host gets back the normalized array, not its original string.
      expect(payload.parameters).toEqual({
        state: ["Gizmo"],
        category: null,
      });
    });
  });
});

describe("getEffectiveParameterValues", () => {
  it('translates explicit `null` to `""` for the controlled prop (strict clear)', () => {
    expect(
      getEffectiveParameterValues({ state: null, category: "Foo" }, undefined),
    ).toEqual({ state: "", category: "Foo" });
  });

  it('translates explicit `null` to `""` for `initialParameters` too (consistent strict-clear semantic across both props)', () => {
    expect(
      getEffectiveParameterValues(undefined, { state: null, category: "Foo" }),
    ).toEqual({ state: "", category: "Foo" });
  });

  it("falls back to `initialParameters` when the controlled prop is undefined", () => {
    expect(getEffectiveParameterValues(undefined, { state: "NY" })).toEqual({
      state: "NY",
    });
  });

  it("falls back to `initialParameters` when the controlled prop is `null` (JS-level guard)", () => {
    expect(getEffectiveParameterValues(null, { state: "NY" })).toEqual({
      state: "NY",
    });
  });

  it("returns `{}` when both inputs are missing", () => {
    expect(getEffectiveParameterValues(undefined, undefined)).toEqual({});
  });
});

describe("buildParametersPayload", () => {
  it("returns slug-keyed `parameters` from the id-keyed `applied` map", () => {
    const result = buildParametersPayload(
      { [STATE_PARAM.id]: ["NY"] },
      DEFAULT_DEFINITIONS,
    );

    expect(result.parameters).toEqual({ state: ["NY"], category: null });
  });

  it("returns slug-keyed `defaultParameters` derived from each parameter's `default` field", () => {
    const result = buildParametersPayload({}, DEFAULT_DEFINITIONS);

    expect(result.defaultParameters).toEqual({
      state: "AR",
      category: null,
    });
  });

  it("omits `lastUsedParameters` when called with two args", () => {
    const result = buildParametersPayload({}, DEFAULT_DEFINITIONS);

    expect(result).not.toHaveProperty("lastUsedParameters");
  });

  it("includes slug-keyed `lastUsedParameters` when called with three args", () => {
    const result = buildParametersPayload({}, DEFAULT_DEFINITIONS, {
      [STATE_PARAM.id]: ["TX"],
    });

    expect(result.lastUsedParameters).toEqual({
      state: ["TX"],
      category: null,
    });
  });
});

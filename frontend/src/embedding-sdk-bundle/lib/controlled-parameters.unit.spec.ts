import type { UiParameter } from "metabase-lib/v1/parameters/types";

import {
  buildControlledParameters,
  buildParametersPayload,
  mapExplicitNullToEmpty,
  resolveSeedParameterValues,
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
});

describe("buildControlledParameters", () => {
  it("maps slug-keyed values to id-keyed and parses each value", () => {
    const result = buildControlledParameters(
      { state: "NY" },
      DEFAULT_DEFINITIONS,
    );

    expect(result[STATE_PARAM.id]).toEqual(["NY"]);
  });

  it("falls back to `parameter.default` for missing slugs", () => {
    const result = buildControlledParameters(
      { state: "NY" },
      DEFAULT_DEFINITIONS,
    );

    expect(result[CATEGORY_PARAM.id]).toEqual(null);
    // Sanity: the slug we did pass.
    expect(result[STATE_PARAM.id]).toEqual(["NY"]);
  });

  it("treats explicit `null` as a strict clear and ignores `parameter.default`", () => {
    const result = buildControlledParameters(
      { state: null },
      DEFAULT_DEFINITIONS,
    );

    expect(result[STATE_PARAM.id]).toEqual(null);
  });
});

describe("resolveSeedParameterValues", () => {
  it("returns `mapExplicitNullToEmpty(controlled)` when the controlled prop is set", () => {
    expect(
      resolveSeedParameterValues({ state: null, category: "Foo" }, undefined),
    ).toEqual({ state: "", category: "Foo" });
  });

  it("falls back to `initialParameters` when the controlled prop is undefined", () => {
    expect(resolveSeedParameterValues(undefined, { state: "NY" })).toEqual({
      state: "NY",
    });
  });

  it("falls back to `initialParameters` when the controlled prop is `null` (JS-level guard)", () => {
    expect(resolveSeedParameterValues(null, { state: "NY" })).toEqual({
      state: "NY",
    });
  });

  it("returns `{}` when both inputs are missing", () => {
    expect(resolveSeedParameterValues(undefined, undefined)).toEqual({});
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

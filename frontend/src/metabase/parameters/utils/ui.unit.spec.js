import {
  getParameterIconName,
  buildHiddenParametersSlugSet,
  getVisibleParameters,
  getParameterWidgetTitle,
} from "./ui";

describe("parameters/utils/ui", () => {
  describe("getParameterIconName", () => {
    it("should return an icon name for the given parameter", () => {
      expect(getParameterIconName({ type: "category" })).toEqual("string");
      expect(getParameterIconName({ type: "date/single" })).toEqual("calendar");
    });

    it("should safely default", () => {
      expect(getParameterIconName({ type: "???" })).toEqual("label");
    });
  });

  describe("buildHiddenParametersSlugSet", () => {
    it("should turn the given string of slugs separated by commas into a set of slug strings", () => {
      expect(buildHiddenParametersSlugSet("a,b,c")).toEqual(
        new Set(["a", "b", "c"]),
      );
    });

    it("should return an empty set for any input that is not a string", () => {
      expect(buildHiddenParametersSlugSet(undefined)).toEqual(new Set());
      expect(buildHiddenParametersSlugSet(111111)).toEqual(new Set());
    });
  });

  describe("getVisibleParameters", () => {
    const parameters = [
      {
        id: 1,
        slug: "foo",
      },
      {
        id: 2,
        slug: "bar",
      },
      {
        id: 3,
        slug: "baz",
      },
      {
        id: 4,
        slug: "qux",
      },
    ];

    const hiddenParameterSlugs = "bar,baz";

    it("should return the parameters that are not hidden", () => {
      expect(getVisibleParameters(parameters, hiddenParameterSlugs)).toEqual([
        {
          id: 1,
          slug: "foo",
        },
        {
          id: 4,
          slug: "qux",
        },
      ]);
    });
  });

  describe("getParameterWidgetTitle", () => {
    it("should return a title for the given parameter", () => {
      expect(getParameterWidgetTitle({ type: "string/starts-with" })).toEqual(
        "Starts with…",
      );

      expect(getParameterWidgetTitle({ type: "number/between" })).toEqual(
        "Between…",
      );
    });

    it("should not return a title for equal operator parameters", () => {
      expect(getParameterWidgetTitle({ type: "string/=" })).toBeUndefined();
      expect(getParameterWidgetTitle({ type: "number/=" })).toBeUndefined();
    });

    it("should default to undefined for parameters without operators", () => {
      expect(getParameterWidgetTitle({ type: "category" })).toBeUndefined();
    });
  });
});

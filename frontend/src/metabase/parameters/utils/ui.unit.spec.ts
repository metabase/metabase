import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";

import {
  getParameterIconName,
  buildHiddenParametersSlugSet,
  getVisibleParameters,
  getParameterWidgetTitle,
} from "./ui";

describe("parameters/utils/ui", () => {
  describe("getParameterIconName", () => {
    it("should return an icon name for the given parameter", () => {
      expect(
        getParameterIconName(createMockUiParameter({ type: "category" })),
      ).toEqual("string");
      expect(
        getParameterIconName(createMockUiParameter({ type: "date/single" })),
      ).toEqual("calendar");
    });

    it("should safely default", () => {
      expect(
        getParameterIconName(createMockUiParameter({ type: "???" })),
      ).toEqual("label");
    });
  });

  describe("buildHiddenParametersSlugSet", () => {
    it("should turn the given string of slugs separated by commas into a set of slug strings", () => {
      expect(buildHiddenParametersSlugSet("a,b,c")).toEqual(
        new Set(["a", "b", "c"]),
      );
    });

    it("should return an empty set for an arg that is undefined", () => {
      expect(buildHiddenParametersSlugSet(undefined)).toEqual(new Set());
    });
  });

  describe("getVisibleParameters", () => {
    const parameters = [
      createMockUiParameter({
        id: "1",
        slug: "foo",
      }),
      createMockUiParameter({
        id: "2",
        slug: "bar",
      }),
      createMockUiParameter({
        id: "3",
        slug: "baz",
      }),
      createMockUiParameter({
        id: "4",
        slug: "qux",
      }),
      createMockUiParameter({
        id: "5",
        hidden: true,
      }),
    ];

    const hiddenParameterSlugs = "bar,baz";

    it("should return the parameters that are not hidden", () => {
      expect(getVisibleParameters(parameters, hiddenParameterSlugs)).toEqual([
        expect.objectContaining({
          id: "1",
          slug: "foo",
        }),
        expect.objectContaining({
          id: "4",
          slug: "qux",
        }),
      ]);
    });
  });

  describe("getParameterWidgetTitle", () => {
    it("should return a title for the given parameter", () => {
      expect(
        getParameterWidgetTitle(
          createMockUiParameter({ type: "string/starts-with" }),
        ),
      ).toEqual("Starts with…");

      expect(
        getParameterWidgetTitle(
          createMockUiParameter({ type: "number/between" }),
        ),
      ).toEqual("Between…");
    });

    it("should not return a title for equal operator parameters", () => {
      expect(
        getParameterWidgetTitle(createMockUiParameter({ type: "string/=" })),
      ).toBeUndefined();
      expect(
        getParameterWidgetTitle(createMockUiParameter({ type: "number/=" })),
      ).toBeUndefined();
    });

    it("should default to undefined for parameters without operators", () => {
      expect(
        getParameterWidgetTitle(createMockUiParameter({ type: "category" })),
      ).toBeUndefined();
    });
  });
});

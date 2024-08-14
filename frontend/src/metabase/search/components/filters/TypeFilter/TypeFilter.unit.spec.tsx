import { TypeFilter } from "metabase/search/components/filters/TypeFilter";
import type { EnabledSearchModel } from "metabase-types/api";

const fromUrl = TypeFilter.fromUrl;
const toUrl = TypeFilter.toUrl;

describe("fromUrl", () => {
  it("should return an array with a single valid type when the input exactly matches a type", () => {
    const types = "collection";
    const result = fromUrl(types);
    expect(result).toEqual(["collection"]);
  });

  it("should return an empty array when the input is null or undefined", () => {
    const nullType = null;
    const nullResult = fromUrl(nullType);
    expect(nullResult).toEqual([]);

    const undefinedType = undefined;
    const undefinedResult = fromUrl(undefinedType);
    expect(undefinedResult).toEqual([]);
  });

  it("should return an empty array when the input is an invalid type", () => {
    const types = "invalidType";
    const result = fromUrl(types);
    expect(result).toEqual([]);
  });

  it("should return an array of valid types when the input is an array of valid types", () => {
    const types: string[] = ["collection", "dashboard"];
    const result = fromUrl(types);
    expect(result).toEqual(["collection", "dashboard"]);
  });

  it("should return an array of valid types when the input is an array with one valid type and one invalid type", () => {
    const types = ["collection", "invalidType"];
    const result = fromUrl(types);
    expect(result).toEqual(["collection"]);
  });

  it("should return an empty array when the input is an empty array", () => {
    const types: string[] = [];
    const result = fromUrl(types);
    expect(result).toEqual([]);
  });
});

describe("toUrl", () => {
  it("should convert an array of valid types to an array of valid types", () => {
    const types: EnabledSearchModel[] = ["collection", "dashboard"];
    const result = toUrl(types);
    expect(result).toEqual(["collection", "dashboard"]);
  });

  it("should return null when the input array is empty", () => {
    const types: EnabledSearchModel[] = [];
    const result = toUrl(types);
    expect(result).toBeNull();
  });

  it("should return null when the input is undefined", () => {
    const types = undefined;
    const result = toUrl(types);
    expect(result).toBeNull();
  });

  it("should return an array with a single valid type when the input array has one valid type", () => {
    const types: EnabledSearchModel[] = ["collection"];
    const result = toUrl(types);
    expect(result).toEqual(["collection"]);
  });
});

import {
  getFiltersFromLocation,
  getSearchTextFromLocation,
  isSearchPageLocation,
} from "metabase/common/search";
import { SearchFilterKeys } from "metabase/common/search/constants";
import { createMockLocation } from "metabase/redux/store/mocks";

describe("isSearchPageLocation", () => {
  it("should return true for a search page location", () => {
    const location = createMockLocation({ pathname: "/search" });
    expect(isSearchPageLocation(location)).toBe(true);
  });

  it("should return true for a search page location with query params", () => {
    const location = createMockLocation({
      pathname: "/search",
      search: "?q=test",
    });
    expect(isSearchPageLocation(location)).toBe(true);
  });

  it('should return false for non-search location that might have "search" in the path', () => {
    const location = createMockLocation({ pathname: "/collection/1-search" });
    expect(isSearchPageLocation(location)).toBe(false);
  });

  it("should return false for non-search location", () => {
    const location = createMockLocation({ pathname: "/some-page" });
    expect(isSearchPageLocation(location)).toBe(false);
  });
});

describe("getSearchTextFromLocation", () => {
  it("should return the search text when on the search page", () => {
    const location = createMockLocation({
      pathname: "/search",
      search: "?q=test",
    });
    expect(getSearchTextFromLocation(location)).toBe("test");
  });

  it("should return an empty string when not on the search page", () => {
    const location = createMockLocation({
      pathname: "/collection/root",
      search: "?q=test",
    });
    expect(getSearchTextFromLocation(location)).toBe("");
  });
});

describe("getFiltersFromLocation", () => {
  it("should return the filters when on the search page", () => {
    const location = createMockLocation({
      pathname: "/search",
      search: `?${SearchFilterKeys.Type}=app&${SearchFilterKeys.Type}=database`,
    });
    expect(getFiltersFromLocation(location)).toEqual({
      [SearchFilterKeys.Type]: ["app", "database"],
    });
  });

  it("should return an empty object when on a non-search page", () => {
    const location = createMockLocation({
      pathname: "/collection/root",
      search: `?${SearchFilterKeys.Type}=app&${SearchFilterKeys.Type}=database`,
    });
    expect(getFiltersFromLocation(location)).toEqual({});
  });

  it("should return only the filters that exist in SearchFilterKeys", () => {
    const location = createMockLocation({
      pathname: "/search",
      search: `?${SearchFilterKeys.Type}=app&${SearchFilterKeys.Type}=database&someOtherFilter=1`,
    });
    expect(getFiltersFromLocation(location)).toEqual({
      [SearchFilterKeys.Type]: ["app", "database"],
    });
  });
});

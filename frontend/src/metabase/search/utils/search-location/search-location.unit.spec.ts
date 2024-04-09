import { SearchFilterKeys } from "metabase/search/constants";
import type { SearchAwareLocation } from "metabase/search/types";
import {
  getFiltersFromLocation,
  getSearchTextFromLocation,
  isSearchPageLocation,
} from "metabase/search/utils";

describe("isSearchPageLocation", () => {
  it("should return true for a search page location", () => {
    const location = { pathname: "/search" };
    const result = isSearchPageLocation(location as SearchAwareLocation);
    expect(result).toBe(true);
  });

  it("should return true for a search page location with query params", () => {
    const location = { pathname: "/search", search: "?q=test" };
    const result = isSearchPageLocation(location as SearchAwareLocation);
    expect(result).toBe(true);
  });

  it('should return false for non-search location that might have "search" in the path', () => {
    const location = { pathname: "/collection/1-search" };
    const result = isSearchPageLocation(location as SearchAwareLocation);
    expect(result).toBe(false);
  });

  it("should return false for non-search location", () => {
    const location = { pathname: "/some-page" };
    const result = isSearchPageLocation(location as SearchAwareLocation);
    expect(result).toBe(false);
  });
});

describe("getSearchTextFromLocation", () => {
  it("should return the search text when on the search page", () => {
    const location = {
      pathname: "/search",
      query: { q: "test" },
    };
    expect(getSearchTextFromLocation(location as SearchAwareLocation)).toBe(
      "test",
    );
  });

  it("should return an empty string when not on the search page", () => {
    const location = {
      pathname: "/collection/root",
      query: {
        q: "test",
      },
    };
    expect(getSearchTextFromLocation(location as SearchAwareLocation)).toBe("");
  });
});

describe("getFiltersFromLocation", () => {
  it("should return the filters when on the search page", () => {
    const location = {
      pathname: "/search",
      query: {
        [SearchFilterKeys.Type]: ["app", "database"],
      },
    };
    expect(getFiltersFromLocation(location as SearchAwareLocation)).toEqual({
      [SearchFilterKeys.Type]: ["app", "database"],
    });
  });

  it("should return an empty object when on a non-search page", () => {
    const location = {
      pathname: "/collection/root",
      query: {
        [SearchFilterKeys.Type]: ["app", "database"],
      },
    };
    expect(getFiltersFromLocation(location as SearchAwareLocation)).toEqual({});
  });

  it("should return only the filters that exist in SearchFilterKeys", () => {
    const location = {
      pathname: "/search",
      query: {
        [SearchFilterKeys.Type]: ["app", "database"],
        someOtherFilter: [1, 2, 3],
      },
    };
    // using `any` here since location.query doesn't match the query
    // of SearchAwareLocation
    expect(getFiltersFromLocation(location as any)).toEqual({
      [SearchFilterKeys.Type]: ["app", "database"],
    });
  });
});

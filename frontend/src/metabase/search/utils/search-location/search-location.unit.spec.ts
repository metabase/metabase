import {
  getFiltersFromLocation,
  getSearchTextFromLocation,
  isSearchPageLocation,
} from "metabase/search/utils";

import { SearchAwareLocation } from "metabase/search/types";
import { SearchFilterKeys } from "metabase/search/constants";

describe("isSearchPageLocation", () => {
  it('should return true when the last component of pathname is "search"', () => {
    const location = {
      pathname: "/search",
      query: {},
    };
    expect(isSearchPageLocation(location as SearchAwareLocation)).toBe(true);
  });

  it('should return false when the last component of pathname is not "search"', () => {
    const location = {
      pathname: "/collection/root",
      query: {},
    };
    expect(isSearchPageLocation(location as SearchAwareLocation)).toBe(false);
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

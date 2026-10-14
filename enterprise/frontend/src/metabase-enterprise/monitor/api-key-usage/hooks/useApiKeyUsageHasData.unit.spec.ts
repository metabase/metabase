import { isResolved } from "./useApiKeyUsageHasData";

const resolvedArgs = {
  isLoadingTables: false,
  isFetching: false,
  isFetchingKeys: false,
  query: {},
  data: {},
  apiKeys: [],
  hasError: false,
};

describe("isResolved", () => {
  it("is false while the table lookup is still loading, even with a query already built", () => {
    expect(isResolved({ ...resolvedArgs, isLoadingTables: true })).toBe(false);
  });

  it("is true once the table lookup finishes but finds no table (query stays null) — the bug this guards against", () => {
    expect(isResolved({ ...resolvedArgs, query: null, data: undefined })).toBe(
      true,
    );
  });

  it("is false if the table lookup finished with no table, but the keys list hasn't settled yet", () => {
    expect(
      isResolved({
        ...resolvedArgs,
        query: null,
        data: undefined,
        isFetchingKeys: true,
      }),
    ).toBe(false);
  });

  it("is false while the count query is still fetching, with a table found", () => {
    expect(isResolved({ ...resolvedArgs, isFetching: true })).toBe(false);
  });

  it("is false while the count data hasn't arrived yet, with a table found", () => {
    expect(isResolved({ ...resolvedArgs, data: undefined })).toBe(false);
  });

  it("is true once the count data arrives, with a table found", () => {
    expect(isResolved(resolvedArgs)).toBe(true);
  });

  it("is true on an error, even with no count data", () => {
    expect(
      isResolved({ ...resolvedArgs, data: undefined, hasError: true }),
    ).toBe(true);
  });

  it("is false until the keys list itself has loaded", () => {
    expect(isResolved({ ...resolvedArgs, apiKeys: undefined })).toBe(false);
  });
});

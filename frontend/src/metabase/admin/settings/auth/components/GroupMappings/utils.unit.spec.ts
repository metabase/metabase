import { createMockGroup } from "metabase-types/api/mocks";

import {
  createGroupLookup,
  withMappingEntry,
  withoutGroups,
  withoutMapping,
} from "./utils";

describe("withMappingEntry", () => {
  it("appends a new mapping", () => {
    expect(withMappingEntry({ first: [1] }, null, "second", [2])).toEqual({
      first: [1],
      second: [2],
    });
  });

  it("keeps a renamed mapping in place", () => {
    const result = withMappingEntry(
      { first: [1], second: [2], third: [3] },
      "second",
      "renamed",
      [4],
    );

    expect(Object.entries(result)).toEqual([
      ["first", [1]],
      ["renamed", [4]],
      ["third", [3]],
    ]);
  });

  it("stores prototype member names as plain keys", () => {
    const result = withMappingEntry({}, null, "__proto__", [1]);

    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });
});

describe("withoutMapping", () => {
  it("drops the mapping and leaves the others alone", () => {
    expect(withoutMapping({ old: [4], devs: [4, 3] }, "old")).toEqual({
      devs: [4, 3],
    });
  });
});

describe("withoutGroups", () => {
  it("scrubs the given group ids from every mapping", () => {
    expect(withoutGroups({ devs: [4, 3], ops: [4] }, [4])).toEqual({
      devs: [3],
      ops: [],
    });
  });
});

describe("createGroupLookup", () => {
  const groupLookup = createGroupLookup([
    createMockGroup(),
    createMockGroup({
      id: 2,
      name: "Administrators",
      magic_group_type: "admin",
    }),
    createMockGroup({ id: 3, name: "foo", magic_group_type: null }),
    createMockGroup({
      id: 4,
      name: "Data Analysts",
      magic_group_type: "data-analyst",
    }),
  ]);

  it("excludes the default groups from the mappable ones", () => {
    expect(groupLookup.mappableGroups.map((group) => group.id)).toEqual([
      2, 3, 4,
    ]);
  });

  it("filters ids of groups that no longer exist", () => {
    expect(groupLookup.existingIds([3, 9])).toEqual([3]);
  });

  it("leaves every built-in group out of a delete cascade", () => {
    expect(groupLookup.actionableIds([2, 3, 4, 9], "delete")).toEqual([3]);
    expect(groupLookup.keptGroupNames([2, 3, 4], "delete")).toEqual([
      "Administrators",
      "Data Analysts",
    ]);
  });

  it("leaves only the Administrators group out of a clear cascade", () => {
    expect(groupLookup.actionableIds([2, 3, 4, 9], "clear")).toEqual([3, 4]);
    expect(groupLookup.keptGroupNames([2, 3, 4], "clear")).toEqual([
      "Administrators",
    ]);
  });
});

import { createMockGroup } from "metabase-types/api/mocks";

import { createGroupLookup, withMappingEntry, withoutMapping } from "./utils";

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

  it("scrubs deleted group ids from the remaining mappings", () => {
    expect(withoutMapping({ old: [4], devs: [4, 3] }, "old", [4])).toEqual({
      devs: [3],
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
  ]);

  it("excludes magic groups from the mappable ones", () => {
    expect(groupLookup.mappableGroups.map((group) => group.id)).toEqual([2, 3]);
  });

  it("filters ids of groups that no longer exist", () => {
    expect(groupLookup.existingIds([3, 9])).toEqual([3]);
  });

  it("leaves the admin group out of cascades", () => {
    expect(groupLookup.actionableIds([2, 3, 9])).toEqual([3]);
    expect(groupLookup.hasAdminGroup([2, 3])).toBe(true);
    expect(groupLookup.hasAdminGroup([3])).toBe(false);
  });
});

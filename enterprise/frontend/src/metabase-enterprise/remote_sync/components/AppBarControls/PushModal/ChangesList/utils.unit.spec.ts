import {
  createMockRemoteSyncEntity,
  createMockRemoteSyncEntityCollection,
  createMockRemoteSyncEntityParent,
} from "metabase-types/api/mocks";

import { groupChanges } from "./utils";

describe("groupChanges", () => {
  it("shows collection change on its group header", () => {
    const collection = createMockRemoteSyncEntityCollection({
      id: 1,
      name: "Sales",
    });
    const groups = groupChanges([
      createMockRemoteSyncEntity({
        id: 1,
        model: "collection",
        name: "Sales",
        collection,
      }),
      createMockRemoteSyncEntity({ id: 2, name: "Revenue", collection }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].path).toEqual(["Sales"]);
    expect(groups[0].collectionEntity?.name).toBe("Sales");
    expect(groups[0].items.map((item) => item.name)).toEqual(["Revenue"]);
  });

  it("nests segments under their changed table", () => {
    const collection = createMockRemoteSyncEntityCollection({
      id: 1,
      name: "Data",
    });
    const groups = groupChanges([
      createMockRemoteSyncEntity({
        id: 5,
        model: "tableusersettings",
        name: "Orders",
        collection,
      }),
      createMockRemoteSyncEntity({
        id: 7,
        model: "segment",
        name: "Big orders",
        parent: createMockRemoteSyncEntityParent({ id: 5, name: "Orders" }),
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(1);
    expect(groups[0].items[0].entity?.name).toBe("Orders");
    expect(groups[0].items[0].children.map((child) => child.name)).toEqual([
      "Big orders",
    ]);
  });

  it("nests segments under their unchanged table by name", () => {
    const groups = groupChanges([
      createMockRemoteSyncEntity({
        id: 7,
        model: "segment",
        name: "Big orders",
        parent: createMockRemoteSyncEntityParent({ id: 5, name: "Orders" }),
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].path).toEqual(["Data"]);
    expect(groups[0].items[0].entity).toBeNull();
    expect(groups[0].items[0].name).toBe("Orders");
    expect(groups[0].items[0].children.map((child) => child.name)).toEqual([
      "Big orders",
    ]);
  });
});

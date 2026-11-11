import {
  createMockCard,
  createMockCollection,
  createMockField,
  createMockRemoteSyncCardData,
  createMockRemoteSyncCardTestData,
  createMockRemoteSyncCollectionData,
  createMockRemoteSyncDimensionData,
  createMockRemoteSyncDirtyItem,
  createMockRemoteSyncSegmentData,
  createMockRemoteSyncTableUserSettingsData,
  createMockTable,
} from "metabase-types/api/mocks";

import { groupChanges } from "./utils";

const SALES = createMockCollection({ id: 1, name: "Sales" });
const DATA = createMockCollection({ id: 2, name: "Data" });
const ORDERS = createMockTable({
  id: 5,
  name: "orders",
  display_name: "Orders",
  collection_id: DATA.id,
  collection: DATA,
});

describe("groupChanges", () => {
  it("shows collection change on its group header", () => {
    const groups = groupChanges([
      createMockRemoteSyncDirtyItem({
        id: 1,
        model: "collection",
        name: "Sales",
        data: createMockRemoteSyncCollectionData({ id: 1, name: "Sales" }),
      }),
      createMockRemoteSyncDirtyItem({
        id: 2,
        model: "card",
        name: "Revenue",
        data: createMockRemoteSyncCardData({
          collection_id: SALES.id,
          collection: SALES,
        }),
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].path).toEqual(["Sales"]);
    expect(groups[0].collectionEntity?.name).toBe("Sales");
    expect(groups[0].items.map((item) => item.name)).toEqual(["Revenue"]);
  });

  it("shows nested collections as one header path, without the root", () => {
    const europe = createMockCollection({
      id: 3,
      name: "Europe",
      effective_ancestors: [
        createMockCollection({ id: "root", name: "Our analytics" }),
        SALES,
      ],
    });
    const groups = groupChanges([
      createMockRemoteSyncDirtyItem({
        model: "card",
        name: "Revenue",
        data: createMockRemoteSyncCardData({
          collection_id: europe.id,
          collection: europe,
        }),
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("collection-3");
    expect(groups[0].path).toEqual(["Sales", "Europe"]);
  });

  it("nests segments under their changed table", () => {
    const groups = groupChanges([
      createMockRemoteSyncDirtyItem({
        id: ORDERS.id,
        model: "tableusersettings",
        name: "Orders",
        data: createMockRemoteSyncTableUserSettingsData({
          table_id: ORDERS.id,
          collection_id: DATA.id,
          table: ORDERS,
          collection: DATA,
        }),
      }),
      createMockRemoteSyncDirtyItem({
        id: 7,
        model: "segment",
        name: "Big orders",
        data: createMockRemoteSyncSegmentData({
          table_id: ORDERS.id,
          table: ORDERS,
        }),
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(1);
    expect(groups[0].items[0].entity?.name).toBe("Orders");
    expect(groups[0].items[0].children.map((child) => child.name)).toEqual([
      "Big orders",
    ]);
  });

  it("nests segments under their unchanged table by its name", () => {
    const groups = groupChanges([
      createMockRemoteSyncDirtyItem({
        id: 7,
        model: "segment",
        name: "Big orders",
        data: createMockRemoteSyncSegmentData({
          table_id: ORDERS.id,
          table: ORDERS,
        }),
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

  it("nests remappings under the table of their field", () => {
    const groups = groupChanges([
      createMockRemoteSyncDirtyItem({
        id: 9,
        model: "dimension",
        name: "Product",
        data: createMockRemoteSyncDimensionData({
          id: 9,
          field_id: 11,
          name: "Product",
          field: createMockField({
            id: 11,
            table_id: ORDERS.id,
            table: ORDERS,
          }),
        }),
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].path).toEqual(["Data"]);
    expect(groups[0].items[0].name).toBe("Orders");
    expect(groups[0].items[0].children.map((child) => child.name)).toEqual([
      "Product",
    ]);
  });

  it("shows a card test in the collection of its card", () => {
    const groups = groupChanges([
      createMockRemoteSyncDirtyItem({
        model: "cardtest",
        name: "Row count",
        data: createMockRemoteSyncCardTestData({
          card: createMockCard({ collection_id: SALES.id, collection: SALES }),
        }),
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].path).toEqual(["Sales"]);
    expect(groups[0].items.map((item) => item.name)).toEqual(["Row count"]);
  });

  it("shows a deleted card test under other content", () => {
    const groups = groupChanges([
      createMockRemoteSyncDirtyItem({
        id: 0,
        model: "cardtest",
        name: "Test of deleted card",
        sync_status: "delete",
        data: null,
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].path).toEqual(["Other content"]);
    expect(groups[0].items.map((item) => item.name)).toEqual([
      "Test of deleted card",
    ]);
  });
});

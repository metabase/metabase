import * as Urls from "metabase/urls";
import {
  createMockCard,
  createMockCollection,
  createMockRemoteSyncActionData,
  createMockRemoteSyncCardData,
  createMockRemoteSyncCardTestData,
  createMockRemoteSyncDataAppData,
  createMockRemoteSyncDirtyItem,
  createMockRemoteSyncSegmentData,
  createMockTable,
} from "metabase-types/api/mocks";

import {
  getItemCollections,
  getItemTable,
  getItemUrl,
  getModelIcon,
} from "./utils";

describe("getModelIcon", () => {
  it("shows a card test with the list icon", () => {
    expect(getModelIcon("cardtest")).toBe("list");
  });
});

describe("getItemUrl", () => {
  it("does not link a card test, since card tests have no page", () => {
    expect(
      getItemUrl(createMockRemoteSyncDirtyItem({ model: "cardtest" })),
    ).toBeNull();
  });

  it("links table settings to their table in Data Studio", () => {
    expect(
      getItemUrl(
        createMockRemoteSyncDirtyItem({ id: 5, model: "tableusersettings" }),
      ),
    ).toBe(Urls.dataStudioTable(5));
  });

  it("links a segment to its published table in Data Studio", () => {
    const segment = createMockRemoteSyncDirtyItem({
      id: 7,
      model: "segment",
      data: createMockRemoteSyncSegmentData({ id: 7, table_id: 5 }),
    });

    expect(getItemUrl(segment)).toBe(
      Urls.dataStudioPublishedTableSegment(5, 7),
    );
  });

  it("links an action of a model to the model's action", () => {
    const action = createMockRemoteSyncDirtyItem({
      id: 2,
      model: "action",
      data: createMockRemoteSyncActionData({ id: 2, model_id: 3 }),
    });

    expect(getItemUrl(action)).toBe(Urls.action({ id: 3 }, 2));
  });

  it("links an action without a model to Data Studio", () => {
    expect(
      getItemUrl(createMockRemoteSyncDirtyItem({ id: 2, model: "action" })),
    ).toBe(Urls.dataStudioAction(2));
  });

  it("links a data app to Data Studio by its slug", () => {
    const dataApp = createMockRemoteSyncDirtyItem({
      model: "dataapp",
      data: createMockRemoteSyncDataAppData({ slug: "sales" }),
    });

    expect(getItemUrl(dataApp)).toBe(Urls.dataStudioDataApp("sales"));
  });

  it("does not link a deleted row", () => {
    expect(
      getItemUrl(createMockRemoteSyncDirtyItem({ id: 0, model: "card" })),
    ).toBeNull();
  });
});

describe("getItemCollections and getItemTable", () => {
  it("puts a card test in the collection of its card", () => {
    const sales = createMockCollection({ id: 1, name: "Sales" });
    const cardTest = createMockRemoteSyncDirtyItem({
      model: "cardtest",
      data: createMockRemoteSyncCardTestData({
        card: createMockCard({ collection: sales }),
      }),
    });

    expect(getItemCollections(cardTest)).toEqual([sales]);
    expect(getItemTable(cardTest)).toBeNull();
  });

  it("puts a segment in its table, in the collection the table is published in", () => {
    const library = createMockCollection({ id: 2, name: "Library" });
    const table = createMockTable({ id: 5, collection: library });
    const segment = createMockRemoteSyncDirtyItem({
      model: "segment",
      data: createMockRemoteSyncSegmentData({ table }),
    });

    expect(getItemCollections(segment)).toEqual([library]);
    expect(getItemTable(segment)).toEqual(table);
  });

  it("gives a collection its ancestors and itself", () => {
    const sales = createMockCollection({ id: 1, name: "Sales" });
    const europe = createMockCollection({
      id: 3,
      name: "Europe",
      effective_ancestors: [
        createMockCollection({ id: "root", name: "Our analytics" }),
        sales,
      ],
    });
    const collection = createMockRemoteSyncDirtyItem({
      id: 3,
      model: "collection",
      data: europe,
    });

    expect(getItemCollections(collection)).toEqual([sales, europe]);
  });

  it("leaves the root collection out", () => {
    const card = createMockRemoteSyncDirtyItem({
      model: "card",
      data: createMockRemoteSyncCardData({
        collection: createMockCollection({ id: "root" }),
      }),
    });

    expect(getItemCollections(card)).toEqual([]);
  });
});

import {
  createMockRemoteSyncEntity,
  createMockRemoteSyncEntityCollection,
  createMockRemoteSyncEntityParent,
} from "metabase-types/api/mocks";

import { getEntityUrl, getModelIcon } from "./utils";

describe("getModelIcon and getEntityUrl", () => {
  it("shows a card test with the list icon", () => {
    expect(getModelIcon("cardtest")).toBe("list");
  });

  it("does not link a card test, since card tests have no page", () => {
    const cardTest = createMockRemoteSyncEntity({
      id: 3,
      model: "cardtest",
      name: "Row count",
      collection: createMockRemoteSyncEntityCollection({
        id: 1,
        name: "Sales",
      }),
      parent: createMockRemoteSyncEntityParent({
        model: "card",
        id: 2,
        name: "Orders",
      }),
    });

    expect(getEntityUrl(cardTest)).toBeNull();
  });
});

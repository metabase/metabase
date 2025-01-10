import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { createMockCollection } from "metabase-types/api/mocks";

import { canCleanUp } from "./utils";

describe("canCleanUp", () => {
  it("does not allow cleaning up analytics collection", () => {
    const collection = createMockCollection({
      entity_id:
        PLUGIN_COLLECTIONS.CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID,
    });
    expect(canCleanUp(collection)).toBe(false);
  });

  it("does not allow cleaning up the root trash collection", () => {
    const collection = createMockCollection({ type: "trash" });
    expect(canCleanUp(collection)).toBe(false);
  });

  it("does not allow cleaning up a collection in the trash", () => {
    const collection = createMockCollection({ archived: true });
    expect(canCleanUp(collection)).toBe(false);
  });

  it("does not allow cleaning up a sample collection", () => {
    const collection = createMockCollection({ is_sample: true });
    expect(canCleanUp(collection)).toBe(false);
  });

  it("does not allow cleaning up a collection when the user does not have write access", () => {
    const collection = createMockCollection({ can_write: true });
    expect(canCleanUp(collection)).toBe(true);
  });
});

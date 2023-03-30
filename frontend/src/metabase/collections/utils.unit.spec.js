import { isPersonalCollection } from "metabase/collections/utils";

describe("isPersonalCollection", () => {
  it("returns true if personal_owner_id is a number", () => {
    const collection = { personal_owner_id: 1 };

    expect(isPersonalCollection(collection)).toBe(true);
  });

  it("returns false if personal_owner_id is not a number", () => {
    const collection = {};

    expect(isPersonalCollection(collection)).toBe(false);
  });
});

import { isEntityId } from "../entity-ids";

describe("entity IDs", () => {
  it("accepts only 21-character NanoIDs", () => {
    expect(isEntityId("questionEntityId00010")).toBe(true);
    expect(isEntityId("question-Entity_Id001")).toBe(true);
    expect(isEntityId("tooShort")).toBe(false);
    expect(isEntityId("questionEntityId0001!")).toBe(false);
    expect(isEntityId(10)).toBe(false);
  });
});

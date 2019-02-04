import Action from "metabase-lib/lib/Action";

describe("Action", () => {
  describe("perform", () => {
    it("should perform the action", () => {
      new Action().perform();
    });
  });
});

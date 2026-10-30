import { getStatusReactions } from "./slack";

describe("getStatusReactions", () => {
  it("swaps the success and failure reactions", () => {
    expect(getStatusReactions("failure")).toEqual({
      add: "x",
      remove: "very-green-check",
    });
    expect(getStatusReactions("success")).toEqual({
      add: "very-green-check",
      remove: "x",
    });
  });
});

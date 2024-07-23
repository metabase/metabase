import { isReact17OrEarlier } from "metabase/lib/react-compat";

describe("React Compat", () => {
  it("can check if React version is 17 or less", () => {
    expect(isReact17OrEarlier("17.0.2")).toBe(true);
    expect(isReact17OrEarlier("18.1.3")).toBe(false);
  });
});

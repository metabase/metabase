import { hasDbRoutingEnabled } from "./utils";

describe("hasDbRoutingEnabled", () => {
  it.each([
    [null, false],
    [undefined, false],
    ["department", true],
    ["team", true],
  ])(
    "returns %s when router_user_attribute is %s",
    (router_user_attribute, expected) => {
      expect(hasDbRoutingEnabled({ router_user_attribute })).toBe(expected);
    },
  );
});

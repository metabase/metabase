import { parsePrincipal, parsePrincipalType } from "./urls";

describe("troubleshoot addresses", () => {
  it("reads a user or group address", () => {
    expect(
      parsePrincipal({ principalType: "group", principalId: "5" }),
    ).toEqual({ type: "group", id: 5 });
  });

  it("falls back to the picker for a tenant address, which is no longer a principal", () => {
    const params = { principalType: "tenant", principalId: "3" };

    expect(parsePrincipal(params)).toBeNull();
    expect(parsePrincipalType(params)).toBe("user");
  });
});

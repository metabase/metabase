import { getIsLocalhostOrigin } from "./get-is-localhost";

describe("getIsLocalhostOrigin", () => {
  it.each([
    ["http://localhost:3000", true],
    ["https://[::1]:444", true],
    ["https://localhost.example.com", false],
    ["null", false],
    [null, false],
  ])("treats origin %s as local: %s", (origin, isLocal) => {
    expect(getIsLocalhostOrigin(origin)).toBe(isLocal);
  });
});

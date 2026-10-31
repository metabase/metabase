import { getIsLocalhost, getIsLocalhostOrigin } from "./get-is-localhost";

describe("getIsLocalhost", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "accepts loopback hostname %s",
    (hostname) => {
      expect(getIsLocalhost(hostname)).toBe(true);
    },
  );

  it.each([
    "metabase.example.com",
    "localhost.example.com",
    "127.0.0.2",
    "192.168.1.1",
  ])("rejects hostname %s", (hostname) => {
    expect(getIsLocalhost(hostname)).toBe(false);
  });
});

describe("getIsLocalhostOrigin", () => {
  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://[::1]:444",
  ])("accepts origin %s", (origin) => {
    expect(getIsLocalhostOrigin(origin)).toBe(true);
  });

  it.each([
    null,
    "null",
    "",
    "https://host.example.com",
    "https://localhost.example.com",
  ])("rejects origin %s", (origin) => {
    expect(getIsLocalhostOrigin(origin)).toBe(false);
  });
});

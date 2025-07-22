import { parseConnectionUri } from "./parseConnectionUri";

describe("parseConnectionUri", () => {
  it("should parse the connection URI", () => {
    const connectionUri =
      "postgres://user:password@host:5432/database?param1=test";
    const result = parseConnectionUri(connectionUri);
    expect(result).toEqual({
      host: "host",
      port: "5432",
      database: "database",
      username: "user",
      password: "password",
      protocol: "postgres",
      searchParams: {
        param1: "test",
      },
    });
  });

  it("should parse encoded params and password", () => {
    const password = "pe@ce&lo/3";
    const param1 = "hey#$";
    const connectionUri = `postgres://user:${encodeURIComponent(password)}@host:5432/database?param1=${encodeURIComponent(param1)}`;
    const result = parseConnectionUri(connectionUri);
    expect(result).toEqual(
      expect.objectContaining({
        password: "pe%40ce%26lo%2F3",
        searchParams: {
          param1,
        },
      }),
    );
  });

  it("should parse a connection without a password", () => {
    const connectionUri = `postgres://john@host:5432/database`;
    const result = parseConnectionUri(connectionUri);
    expect(result).toEqual(
      expect.objectContaining({
        username: "john",
        password: "",
      }),
    );
  });

  it("returns null for multiple hosts", () => {
    const connectionUri = `postgresql://username:password@host:3333,host2:5555`;
    const result = parseConnectionUri(connectionUri);
    expect(result).toBeNull();
  });
});

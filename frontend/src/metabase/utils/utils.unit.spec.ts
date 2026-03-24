import { SignJWT } from "jose";

import { extractResourceIdFromJwtToken } from "metabase/lib/utils";

const SECRET = new TextEncoder().encode("test-secret-key-for-jwt-signing");

const createJwtToken = async (payload: object): Promise<string> => {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .sign(SECRET);
};

describe("extractResourceIdFromJwtToken", () => {
  it("should extract dashboard id from JWT token", async () => {
    const token = await createJwtToken({
      resource: { dashboard: 123 },
    });

    expect(extractResourceIdFromJwtToken(token)).toBe(123);
  });

  it("should extract question id from JWT token", async () => {
    const token = await createJwtToken({
      resource: { question: 456 },
    });

    expect(extractResourceIdFromJwtToken(token)).toBe(456);
  });

  it("should prefer dashboard over question when both are present", async () => {
    const token = await createJwtToken({
      resource: { dashboard: 123, question: 456 },
    });

    expect(extractResourceIdFromJwtToken(token)).toBe(123);
  });

  it("should return null for invalid JWT format", () => {
    expect(extractResourceIdFromJwtToken("not-a-jwt")).toBeNull();
    expect(extractResourceIdFromJwtToken("only.two")).toBeNull();
    expect(extractResourceIdFromJwtToken("")).toBeNull();
  });

  it("should return null when resource is missing", async () => {
    const token = await createJwtToken({
      someOtherField: "value",
    });

    expect(extractResourceIdFromJwtToken(token)).toBeNull();
  });

  it("should return null when resource has neither dashboard nor question", async () => {
    const token = await createJwtToken({
      resource: { other: "value" },
    });

    expect(extractResourceIdFromJwtToken(token)).toBeUndefined();
  });

  it("should return null for invalid base64 payload", () => {
    const token = "header.!!!invalid-base64!!!.signature";

    expect(extractResourceIdFromJwtToken(token)).toBeNull();
  });

  it("should return null for invalid JSON in payload", () => {
    const header = btoa(JSON.stringify({ alg: "HS256" }));
    const invalidJsonPayload = btoa("not valid json");
    const token = `${header}.${invalidJsonPayload}.signature`;

    expect(extractResourceIdFromJwtToken(token)).toBeNull();
  });

  it("should handle string entity ids", async () => {
    const token = await createJwtToken({
      resource: { dashboard: "abc-123" },
    });

    expect(extractResourceIdFromJwtToken(token)).toBe("abc-123");
  });
});

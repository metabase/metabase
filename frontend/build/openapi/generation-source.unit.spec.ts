import {
  createGenerationSource,
  createSpecHash,
  getOpenApiEdition,
  parseGenerationSource,
} from "./generation-source";

function createSpec(paths: Record<string, object>) {
  return JSON.stringify({
    openapi: "3.1.0",
    paths,
  });
}

describe("OpenAPI generation source", () => {
  describe("getOpenApiEdition", () => {
    it("detects an enterprise document from its routes", () => {
      expect(
        getOpenApiEdition(
          createSpec({
            "/api/card": {},
            "/api/ee/advanced-permissions": {},
          }),
        ),
      ).toBe("ee");
    });

    it("detects an OSS document", () => {
      expect(getOpenApiEdition(createSpec({ "/api/card": {} }))).toBe("oss");
    });

    it("rejects invalid OpenAPI documents", () => {
      expect(getOpenApiEdition("not JSON")).toBeUndefined();
      expect(getOpenApiEdition(JSON.stringify({ paths: {} }))).toBeUndefined();
    });
  });

  describe("createSpecHash", () => {
    it("creates a SHA-256 hash from canonical JSON", () => {
      const compact = '{"openapi":"3.1.0","paths":{"/api/card":{}}}';
      const formatted = `{
        "paths": { "/api/card": {} },
        "openapi": "3.1.0"
      }`;

      expect(createSpecHash(compact)).toBe(createSpecHash(formatted));
      expect(createSpecHash(compact)).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it("changes when the specification changes", () => {
      expect(createSpecHash(createSpec({ "/api/card": {} }))).not.toBe(
        createSpecHash(createSpec({ "/api/dashboard": {} })),
      );
    });
  });

  describe("generation source", () => {
    it("creates and parses source", () => {
      const generatedAt = new Date("2026-08-20T14:32:10.123Z");
      const source = createGenerationSource(
        "ee",
        createSpec({ "/api/ee/example": {} }),
        generatedAt,
      );

      expect(parseGenerationSource(JSON.stringify(source))).toEqual(source);
      expect(source.generatedAt).toBe("2026-08-20T14:32:10.123Z");
    });

    it("rejects incomplete source", () => {
      expect(
        parseGenerationSource(
          JSON.stringify({ edition: "ee", specHash: "sha256:example" }),
        ),
      ).toBeUndefined();
    });
  });
});

import { getSchemaDisplayName } from "./schema";

describe("getSchemaDisplayName", () => {
  it("should handle empty string", () => {
    expect(getSchemaDisplayName("")).toBe("");
  });

  it("should handle simple schema names", () => {
    expect(getSchemaDisplayName("public")).toBe("Public");
  });

  it("should handle schema names with whitespace", () => {
    expect(getSchemaDisplayName("public schema")).toBe("Public Schema");
  });

  it("should handle schema names with underscores", () => {
    expect(getSchemaDisplayName("public_schema")).toBe("Public Schema");
  });

  it("should handle schema names with hyphens", () => {
    expect(getSchemaDisplayName("public-schema")).toBe("Public-Schema");
  });

  it("should handle schema names with special characters", () => {
    expect(getSchemaDisplayName("public.schema")).toBe("Public.schema");
  });
});

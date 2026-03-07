import { describe, it, expect, vi } from "vitest";
import { FieldResolver } from "../../core/field-resolver.js";
import type { MetabaseClient } from "../../core/client.js";
import { CliError } from "../../core/validation.js";

function mockClient(
  fields: Array<{
    id: number;
    name: string;
    display_name: string;
    base_type: string;
    semantic_type: string | null;
  }>,
): MetabaseClient {
  return {
    GET: vi.fn().mockResolvedValue({
      data: { fields },
    }),
    POST: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  };
}

describe("FieldResolver", () => {
  const fields = [
    {
      id: 10,
      name: "created_at",
      display_name: "Created At",
      base_type: "type/DateTime",
      semantic_type: null,
    },
    {
      id: 20,
      name: "total",
      display_name: "Total Amount",
      base_type: "type/Float",
      semantic_type: null,
    },
  ];

  it("passes through numeric IDs", async () => {
    const client = mockClient(fields);
    const resolver = new FieldResolver(client);
    expect(await resolver.resolve(1, 42)).toBe(42);
    expect(client.GET).not.toHaveBeenCalled();
  });

  it("passes through string numeric IDs", async () => {
    const client = mockClient(fields);
    const resolver = new FieldResolver(client);
    expect(await resolver.resolve(1, "42")).toBe(42);
    expect(client.GET).not.toHaveBeenCalled();
  });

  it("resolves by field name", async () => {
    const client = mockClient(fields);
    const resolver = new FieldResolver(client);
    expect(await resolver.resolve(1, "created_at")).toBe(10);
  });

  it("resolves by display name", async () => {
    const client = mockClient(fields);
    const resolver = new FieldResolver(client);
    expect(await resolver.resolve(1, "Total Amount")).toBe(20);
  });

  it("resolves case-insensitively", async () => {
    const client = mockClient(fields);
    const resolver = new FieldResolver(client);
    expect(await resolver.resolve(1, "CREATED_AT")).toBe(10);
    expect(await resolver.resolve(1, "total amount")).toBe(20);
  });

  it("throws CliError for unknown field with suggestion", async () => {
    const client = mockClient(fields);
    const resolver = new FieldResolver(client);
    try {
      await resolver.resolve(1, "created");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      const err = e as CliError;
      expect(err.code).toBe("unknown_field");
      expect(err.hint).toContain("created_at");
    }
  });

  it("caches table metadata", async () => {
    const client = mockClient(fields);
    const resolver = new FieldResolver(client);
    await resolver.resolve(1, "total");
    await resolver.resolve(1, "created_at");
    expect(client.GET).toHaveBeenCalledTimes(1);
  });

  it("fetches separately for different tables", async () => {
    const client = mockClient(fields);
    const resolver = new FieldResolver(client);
    await resolver.resolve(1, "total");
    await resolver.resolve(2, "total");
    expect(client.GET).toHaveBeenCalledTimes(2);
  });
});

import { getQualifiedName } from "./utils";

describe("getQualifiedName", () => {
  it.each<{ parts: (string | null)[]; expected: string }>([
    { parts: ["public", "orders"], expected: "public/orders" },
    { parts: [null, "public", "orders"], expected: "public/orders" },
    { parts: ["", "public", "orders"], expected: "public/orders" },
    { parts: ["acme", "public", "orders"], expected: "acme/public/orders" },
    { parts: [null, null, "orders"], expected: "orders" },
    { parts: ["", "", "orders"], expected: "orders" },
    { parts: ["acme", "", "orders"], expected: "acme/orders" },
    { parts: ["acme", null, "orders"], expected: "acme/orders" },
  ])("joins $parts → '$expected'", ({ parts, expected }) => {
    expect(getQualifiedName(...parts)).toBe(expected);
  });
});

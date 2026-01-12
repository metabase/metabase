import { isSerializable } from "./objects";

describe("isSerializable", () => {
  describe("primitive values", () => {
    it("should return true for null", () => {
      expect(isSerializable(null)).toBe(true);
    });

    it("should return true for undefined", () => {
      expect(isSerializable(undefined)).toBe(true);
    });

    it("should return true for strings", () => {
      expect(isSerializable("hello")).toBe(true);
      expect(isSerializable("")).toBe(true);
    });

    it("should return true for numbers", () => {
      expect(isSerializable(42)).toBe(true);
      expect(isSerializable(0)).toBe(true);
      expect(isSerializable(-1)).toBe(true);
      expect(isSerializable(3.14)).toBe(true);
    });

    it("should return true for booleans", () => {
      expect(isSerializable(true)).toBe(true);
      expect(isSerializable(false)).toBe(true);
    });

    it("should return true for bigint", () => {
      expect(isSerializable(BigInt(123))).toBe(true);
    });
  });

  describe("non-serializable values", () => {
    it("should return false for functions", () => {
      expect(isSerializable(() => {})).toBe(false);
      expect(isSerializable(function () {})).toBe(false);
      expect(isSerializable(async () => {})).toBe(false);
    });

    it("should return false for symbols", () => {
      expect(isSerializable(Symbol("test"))).toBe(false);
      expect(isSerializable(Symbol.for("test"))).toBe(false);
    });

    it("should return false for class instances", () => {
      class MyClass {
        value = 42;
      }
      expect(isSerializable(new MyClass())).toBe(false);
    });

    it("should return false for Error instances", () => {
      expect(isSerializable(new Error("test"))).toBe(false);
      expect(isSerializable(new TypeError("test"))).toBe(false);
    });

    it("should return false for RegExp instances", () => {
      expect(isSerializable(/test/)).toBe(false);
      expect(isSerializable(new RegExp("test"))).toBe(false);
    });

    it("should return false for Map instances", () => {
      expect(isSerializable(new Map())).toBe(false);
    });

    it("should return false for Set instances", () => {
      expect(isSerializable(new Set())).toBe(false);
    });

    it("should return false for WeakMap instances", () => {
      expect(isSerializable(new WeakMap())).toBe(false);
    });

    it("should return false for WeakSet instances", () => {
      expect(isSerializable(new WeakSet())).toBe(false);
    });
  });

  describe("Date objects", () => {
    it("should return false for Date instances", () => {
      expect(isSerializable(new Date())).toBe(false);
      expect(isSerializable(new Date("2024-01-01"))).toBe(false);
    });
  });

  describe("plain objects", () => {
    it("should return true for empty objects", () => {
      expect(isSerializable({})).toBe(true);
    });

    it("should return true for objects with serializable values", () => {
      expect(
        isSerializable({
          name: "test",
          count: 42,
          active: true,
        }),
      ).toBe(true);
    });

    it("should return true for nested objects with serializable values", () => {
      expect(
        isSerializable({
          user: {
            name: "test",
            metadata: {
              age: 25,
            },
          },
        }),
      ).toBe(true);
    });

    it("should return true for objects created with Object.create(null)", () => {
      const obj = Object.create(null);
      obj.key = "value";
      expect(isSerializable(obj)).toBe(true);
    });

    it("should return false for objects containing functions", () => {
      expect(
        isSerializable({
          name: "test",
          callback: () => {},
        }),
      ).toBe(false);
    });

    it("should return false for objects containing symbols", () => {
      expect(
        isSerializable({
          name: "test",
          sym: Symbol("test"),
        }),
      ).toBe(false);
    });

    it("should return false for nested objects containing functions", () => {
      expect(
        isSerializable({
          user: {
            name: "test",
            onClick: () => {},
          },
        }),
      ).toBe(false);
    });
  });

  describe("arrays", () => {
    it("should return true for empty arrays", () => {
      expect(isSerializable([])).toBe(true);
    });

    it("should return true for arrays with serializable values", () => {
      expect(isSerializable([1, 2, 3])).toBe(true);
      expect(isSerializable(["a", "b", "c"])).toBe(true);
      expect(isSerializable([true, false])).toBe(true);
    });

    it("should return true for arrays with mixed serializable types", () => {
      expect(isSerializable([1, "test", true, null])).toBe(true);
    });

    it("should return true for nested arrays", () => {
      expect(
        isSerializable([
          [1, 2],
          [3, 4],
        ]),
      ).toBe(true);
    });

    it("should return true for arrays of objects", () => {
      expect(
        isSerializable([
          { id: 1, name: "first" },
          { id: 2, name: "second" },
        ]),
      ).toBe(true);
    });

    it("should return false for arrays containing functions", () => {
      expect(isSerializable([1, 2, () => {}])).toBe(false);
    });

    it("should return false for arrays containing symbols", () => {
      expect(isSerializable([1, 2, Symbol("test")])).toBe(false);
    });

    it("should return false for arrays containing class instances", () => {
      class MyClass {}
      expect(isSerializable([1, 2, new MyClass()])).toBe(false);
    });

    it("should return false for nested arrays containing non-serializable values", () => {
      expect(
        isSerializable([
          [1, 2],
          [3, () => {}],
        ]),
      ).toBe(false);
    });
  });

  describe("complex nested structures", () => {
    it("should return true for deeply nested serializable structures", () => {
      expect(
        isSerializable({
          users: [
            {
              name: "Alice",
              posts: [
                { title: "Post 1", likes: 10 },
                { title: "Post 2", likes: 5 },
              ],
            },
            {
              name: "Bob",
              posts: [{ title: "Post 3", likes: 8 }],
            },
          ],
          metadata: {
            total: 2,
            active: true,
          },
        }),
      ).toBe(true);
    });

    it("should return false for deeply nested structures with non-serializable values", () => {
      expect(
        isSerializable({
          users: [
            {
              name: "Alice",
              posts: [
                { title: "Post 1", onClick: () => {} },
                { title: "Post 2", likes: 5 },
              ],
            },
          ],
        }),
      ).toBe(false);
    });
  });
});

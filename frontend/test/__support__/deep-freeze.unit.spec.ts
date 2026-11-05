import { deepFreeze } from "./deep-freeze";

describe("deepFreeze", () => {
  it("freezes nested plain objects and arrays and returns the same value", () => {
    const value = { nested: { list: [{ a: 1 }] } };

    const result = deepFreeze(value);

    expect(result).toBe(value);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.nested)).toBe(true);
    expect(Object.isFrozen(value.nested.list)).toBe(true);
    expect(Object.isFrozen(value.nested.list[0])).toBe(true);
  });

  it("leaves class instances and built-ins unfrozen", () => {
    class Box {
      content = { a: 1 };
    }
    const value = { box: new Box(), date: new Date(0) };

    deepFreeze(value);

    expect(Object.isFrozen(value.box)).toBe(false);
    expect(Object.isFrozen(value.box.content)).toBe(false);
    expect(Object.isFrozen(value.date)).toBe(false);
  });

  it("handles reference cycles", () => {
    type Node = { next?: Node };
    const node: Node = {};
    node.next = node;

    expect(() => deepFreeze(node)).not.toThrow();
    expect(Object.isFrozen(node)).toBe(true);
  });
});

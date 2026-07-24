import {
  MAX_PROP_COMPARE_DEPTH,
  arePropsEquivalent,
} from "./are-props-equivalent";

const nest = (depth: number, leaf: unknown): unknown =>
  depth === 0 ? leaf : { next: nest(depth - 1, leaf) };

describe("arePropsEquivalent", () => {
  describe("identity and primitives", () => {
    it("treats the same reference as equivalent", () => {
      const value = { a: 1 };

      expect(arePropsEquivalent(value, value)).toBe(true);
    });

    it.each([
      ["numbers", 1, 1, true],
      ["different numbers", 1, 2, false],
      ["strings", "a", "a", true],
      ["null", null, null, true],
      ["null vs object", null, {}, false],
      ["undefined vs null", undefined, null, false],
      ["NaN (Object.is semantics)", NaN, NaN, true],
    ])("compares %s", (_label, rendered, next, expected) => {
      expect(arePropsEquivalent(rendered, next)).toBe(expected);
    });
  });

  describe("object literals", () => {
    it("compares structurally equal literals as equivalent", () => {
      expect(arePropsEquivalent({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
    });

    it("detects a changed value", () => {
      expect(arePropsEquivalent({ a: 1 }, { a: 2 })).toBe(false);
    });

    it("detects a differing key count", () => {
      expect(arePropsEquivalent({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    });

    it("detects renamed keys that keep the key count", () => {
      expect(arePropsEquivalent({ a: 1 }, { b: 1 })).toBe(false);
    });

    it("compares nested literals", () => {
      expect(
        arePropsEquivalent({ outer: { inner: 1 } }, { outer: { inner: 1 } }),
      ).toBe(true);
      expect(
        arePropsEquivalent({ outer: { inner: 1 } }, { outer: { inner: 2 } }),
      ).toBe(false);
    });

    it("treats a null-prototype object as a literal", () => {
      const rendered = Object.assign(Object.create(null), { x: 1 });
      const next = Object.assign(Object.create(null), { x: 1 });

      expect(arePropsEquivalent(rendered, next)).toBe(true);
    });
  });

  describe("arrays", () => {
    it("compares element-wise", () => {
      expect(arePropsEquivalent([1, { a: 1 }], [1, { a: 1 }])).toBe(true);
      expect(arePropsEquivalent([1, { a: 1 }], [1, { a: 2 }])).toBe(false);
    });

    it("detects a length change", () => {
      expect(arePropsEquivalent([1], [1, 2])).toBe(false);
    });

    it("does not treat an array as equivalent to an object", () => {
      expect(arePropsEquivalent([], {})).toBe(false);
    });
  });

  describe("foreign values compare by identity, not by traversal", () => {
    it("does not walk class instances", () => {
      class Query {
        constructor(public id: number) {}
      }

      const instance = new Query(1);

      expect(arePropsEquivalent(instance, instance)).toBe(true);
      // Structurally identical, but a custom prototype - not traversed.
      expect(arePropsEquivalent(new Query(1), new Query(1))).toBe(false);
    });

    it("does not walk proxies of foreign objects", () => {
      const target = { a: 1 };
      const proxy = new Proxy(target, {});

      expect(arePropsEquivalent(proxy, proxy)).toBe(true);
    });

    it("compares functions by identity", () => {
      const fn = () => {};

      expect(arePropsEquivalent({ onClick: fn }, { onClick: fn })).toBe(true);
      expect(
        arePropsEquivalent({ onClick: () => {} }, { onClick: () => {} }),
      ).toBe(false);
    });

    // Without the plain-object guard these would each expose no own enumerable
    // keys, so an unguarded walk would vacuously report them equal and the
    // mediated root would skip a genuine update.
    it.each([
      ["dates", new Date("2020-01-01"), new Date("2021-06-15")],
      ["maps", new Map([["a", 1]]), new Map([["b", 2]])],
      ["sets", new Set([1]), new Set([2])],
      ["regexps", /a/, /b/],
    ])(
      "does not report two different %s as equivalent",
      (_label, rendered, next) => {
        expect(arePropsEquivalent(rendered, next)).toBe(false);
      },
    );
  });

  describe("depth bound", () => {
    it("compares structures within the depth limit", () => {
      const depth = MAX_PROP_COMPARE_DEPTH - 1;

      expect(arePropsEquivalent(nest(depth, 1), nest(depth, 1))).toBe(true);
      expect(arePropsEquivalent(nest(depth, 1), nest(depth, 2))).toBe(false);
    });

    it("falls back to identity past the depth limit", () => {
      const tooDeep = MAX_PROP_COMPARE_DEPTH + 1;

      // Structurally equal, but beyond the bound, so reported as different.
      expect(arePropsEquivalent(nest(tooDeep, 1), nest(tooDeep, 1))).toBe(
        false,
      );

      // The same reference past the bound still short-circuits on identity.
      const shared = nest(3, 1);
      expect(
        arePropsEquivalent(nest(tooDeep, shared), nest(tooDeep, shared)),
      ).toBe(false);
    });
  });

  describe("the data-app mediated-mount case", () => {
    // The query is a foreign object with a stable identity across renders, while
    // the card and its visualizationSettings are fresh literals each render.
    const query = Object.create({ isQuery: true });

    const buildCard = (settings: Record<string, unknown>) => ({
      card: { query, visualization: "line", visualizationSettings: settings },
      height: "320px",
      width: "100%",
    });

    it("reports no change when only the wrapper objects are re-created", () => {
      expect(
        arePropsEquivalent(
          buildCard({ "graph.y_axis.title_text": "Orders" }),
          buildCard({ "graph.y_axis.title_text": "Orders" }),
        ),
      ).toBe(true);
    });

    it("reports a change when a nested setting actually changes", () => {
      expect(
        arePropsEquivalent(
          buildCard({ "graph.y_axis.title_text": "Orders" }),
          buildCard({ "graph.y_axis.title_text": "Revenue" }),
        ),
      ).toBe(false);
    });

    it("reports a change when the query itself is replaced", () => {
      const next = {
        card: {
          query: Object.create({ isQuery: true }),
          visualization: "line",
          visualizationSettings: {},
        },
        height: "320px",
        width: "100%",
      };

      expect(arePropsEquivalent(buildCard({}), next)).toBe(false);
    });
  });
});

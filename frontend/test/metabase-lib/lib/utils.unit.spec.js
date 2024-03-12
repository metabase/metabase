import { sortObject, memoizeClass } from "metabase-lib/v1/utils";

describe("sortObject", () => {
  it("should serialize identically regardless of property creation order", () => {
    const o1 = {};
    o1.a = 1;
    o1.b = 2;
    const o2 = {};
    o2.b = 2;
    o2.a = 1;

    expect(JSON.stringify(sortObject(o1))).toEqual(
      JSON.stringify(sortObject(o2)),
    );
  });

  it("should not sort arrays", () => {
    expect(sortObject(["a", "c", "b"])).toEqual(["a", "c", "b"]);
  });

  it("should sort keys recursively", () => {
    const o1 = { o: {} };
    o1.o.a = 1;
    o1.o.b = 2;
    const o2 = { o: {} };
    o2.o.b = 2;
    o2.o.a = 1;

    expect(JSON.stringify(sortObject(o1))).toEqual(
      JSON.stringify(sortObject(o2)),
    );
  });
});

describe("memoize", () => {
  it("should memoize method", () => {
    let x = 0;
    class fooInner {
      bar() {
        return ++x;
      }
    }
    const foo = memoizeClass("bar")(fooInner);
    const f = new foo();
    expect(f.bar()).toEqual(1);
    expect(f.bar()).toEqual(1);
  });

  it("should memoize method with objects", () => {
    class fooInner {
      bar() {
        return {};
      }
    }
    const foo = memoizeClass("bar")(fooInner);
    const f = new foo();
    const x = f.bar();
    expect(f.bar()).toEqual(x);
  });

  it("should use args in cache key", () => {
    class fooInner {
      bar(a, b, c) {
        return a + b + c;
      }
    }
    const foo = memoizeClass("bar")(fooInner);
    const f = new foo();
    expect(f.bar(1, 2, 3)).toEqual(6);
    expect(f.bar(1, 2, 4)).toEqual(7);
  });

  it("should allow calling with variable number of args", () => {
    class fooInner {
      bar(x) {
        return x;
      }
    }
    const foo = memoizeClass("bar")(fooInner);
    const f = new foo();
    expect(f.bar()).toEqual(undefined);
    expect(f.bar(1)).toEqual(1);
  });

  it("should memoize multiple methods", () => {
    let x = 0;
    class fooInner {
      bar() {
        return ++x;
      }

      biz() {
        return ++x;
      }
    }
    const foo = memoizeClass("bar", "biz")(fooInner);
    const f = new foo();
    expect(f.bar()).toEqual(1);
    expect(f.bar()).toEqual(1);
    expect(f.biz()).toEqual(2);
    expect(f.biz()).toEqual(2);
  });

  it("should throw on nonexistant keys", () => {
    expect(() => {
      class fooInner {}
      memoizeClass("bar")(fooInner);
    }).toThrow();
  });
});

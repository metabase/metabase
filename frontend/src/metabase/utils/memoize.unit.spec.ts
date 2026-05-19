import { memoizeClass } from "./memoize";

describe("memoize", () => {
  it("should memoize method", () => {
    let x = 0;
    class fooInner {
      bar() {
        return ++x;
      }
    }
    const foo = memoizeClass<fooInner>("bar")(fooInner);
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
    const foo = memoizeClass<fooInner>("bar")(fooInner);
    const f = new foo();
    const x = f.bar();
    expect(f.bar()).toEqual(x);
  });

  it("should use args in cache key", () => {
    class fooInner {
      bar(a: number, b: number, c: number) {
        return a + b + c;
      }
    }
    const foo = memoizeClass<fooInner>("bar")(fooInner);
    const f = new foo();
    expect(f.bar(1, 2, 3)).toEqual(6);
    expect(f.bar(1, 2, 4)).toEqual(7);
  });

  it("should allow calling with variable number of args", () => {
    class fooInner {
      bar(x?: number) {
        return x;
      }
    }
    const foo = memoizeClass<fooInner>("bar")(fooInner);
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
    const foo = memoizeClass<fooInner>("bar", "biz")(fooInner);
    const f = new foo();
    expect(f.bar()).toEqual(1);
    expect(f.bar()).toEqual(1);
    expect(f.biz()).toEqual(2);
    expect(f.biz()).toEqual(2);
  });

  it("should throw on nonexistent keys", () => {
    expect(() => {
      class fooInner {}
      memoizeClass("bar")(fooInner);
    }).toThrow();
  });
});

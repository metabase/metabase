import { memoize } from "./use-memoized-callback";

describe("memoize", () => {
  it("should return same result for same arguments", () => {
    const add = jest.fn((a: number, b: number) => a + b);
    const memoizedAdd = memoize(add);

    expect(memoizedAdd(1, 2)).toBe(3);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenLastCalledWith(1, 2);

    expect(memoizedAdd(1, 2)).toBe(3);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("should handle different argument combinations", () => {
    const add = jest.fn((a: number, b: number) => a + b);
    const memoizedAdd = memoize(add);

    expect(memoizedAdd(1, 2)).toBe(3);
    expect(memoizedAdd(2, 3)).toBe(5);
    expect(memoizedAdd(1, 2)).toBe(3);

    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenNthCalledWith(1, 1, 2);
    expect(add).toHaveBeenNthCalledWith(2, 2, 3);
  });

  it("should handle functions with different argument lengths", () => {
    const sum = jest.fn((...args: number[]) => args.reduce((a, b) => a + b, 0));
    const memoizedSum = memoize(sum);

    expect(memoizedSum(1)).toBe(1);
    expect(memoizedSum(1, 2)).toBe(3);
    expect(memoizedSum(1)).toBe(1);

    expect(sum).toHaveBeenCalledTimes(2);
    expect(sum).toHaveBeenNthCalledWith(1, 1);
    expect(sum).toHaveBeenNthCalledWith(2, 1, 2);
  });

  it("should handle object arguments", () => {
    const processObject = jest.fn((obj: { x: number }) => obj.x * 2);
    const memoizedProcess = memoize(processObject);
    const obj = { x: 5 };

    expect(memoizedProcess(obj)).toBe(10);
    expect(memoizedProcess(obj)).toBe(10);
    expect(memoizedProcess({ x: 5 })).toBe(10);

    expect(processObject).toHaveBeenCalledTimes(2);
    expect(processObject).toHaveBeenNthCalledWith(1, obj);
    expect(processObject).toHaveBeenNthCalledWith(2, { x: 5 });
  });

  it("should handle functions as arguments", () => {
    const compose = jest.fn((f: (x: number) => number, x: number) => f(x));
    const double = (x: number) => x * 2;
    const memoizedCompose = memoize(compose);

    expect(memoizedCompose(double, 5)).toBe(10);
    expect(memoizedCompose(double, 5)).toBe(10);

    expect(compose).toHaveBeenCalledTimes(1);
    expect(compose).toHaveBeenCalledWith(double, 5);
  });

  it("should handle null and undefined arguments", () => {
    const processNullable = jest.fn((a: null | undefined | number) =>
      a === null ? "null" : a === undefined ? "undefined" : "number",
    );
    const memoizedProcess = memoize(processNullable);

    expect(memoizedProcess(null)).toBe("null");
    expect(memoizedProcess(undefined)).toBe("undefined");
    expect(memoizedProcess(null)).toBe("null");

    expect(processNullable).toHaveBeenCalledTimes(2);
    expect(processNullable).toHaveBeenNthCalledWith(1, null);
    expect(processNullable).toHaveBeenNthCalledWith(2, undefined);
  });
});

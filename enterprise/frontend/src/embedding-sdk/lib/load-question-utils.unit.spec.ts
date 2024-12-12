import { getParameterDependencyKey } from "embedding-sdk/lib/load-question-utils";

describe("getParameterDependencyKey", () => {
  it("generates an order-independent parameter dependency key", () => {
    // ensure that the order of the parameters does not matter
    expect(getParameterDependencyKey({ foo: 1, bar: 2, baz: 3 })).toEqual(
      getParameterDependencyKey({ bar: 2, baz: 3, foo: 1 }),
    );

    expect(getParameterDependencyKey({ foo: 1, bar: 2 })).toEqual(
      "bar=2:foo=1",
    );
  });
});

import { quoteParameters, unquoteParameters } from "./quote-unquote-parameters";

describe("quoteParameters <-> unquoteParameters", () => {
  const testCases = [
    { input: { key: "value" }, expected: { key: "value" } },
    { input: { key: null }, expected: { key: null } },
    { input: { empty: "" }, expected: { empty: "" } },
    { input: { quotes: 'has "quotes"' }, expected: { quotes: 'has "quotes"' } },
    {
      input: { multi: "a", nullVal: null, emptyStr: "" },
      expected: { multi: "a", nullVal: null, emptyStr: "" },
    },
    { input: {}, expected: {} },
  ];

  testCases.forEach(({ input, expected }) => {
    it(`should round-trip ${JSON.stringify(input)}`, () => {
      const quoted = quoteParameters(input as any); // any to handle unexpected values
      const unquoted = unquoteParameters(quoted);
      expect(unquoted).toEqual(expected);
    });
  });

  it("should handle malformed quotes in unquote", () => {
    expect(
      unquoteParameters({ incomplete: '"incomplete', trailing: 'trailing"' }),
    ).toEqual({ incomplete: '"incomplete', trailing: 'trailing"' });
  });
});

describe.each`
  a    | b
  ${1} | ${"x"}
`("table $a $b", ({ a, b }) => {
  test(`checks ${a}`, () => {
    expect(expect.getState().currentTestName).toBe(`table 1 "x" checks 1`);
  });
});
test.each([[1, { k: "v" }]])("format %i %o %p %#", () => {});

test("sees no matcher of another file", () => {
  expect(typeof expect(1).toBeLeakedMatcher).toBe("undefined");
});
test("sees no global of another file", () => {
  expect(globalThis.leakedGlobal).toBeUndefined();
});
test("sees no prototype change of another file", () => {
  expect([].leakedMethod).toBeUndefined();
});
test("sees no Math change of another file", () => {
  expect(Math.random()).not.toBe(0.5);
});
test("sees no JSON or Date change of another file", () => {
  expect(JSON.leakedKey).toBeUndefined();
  expect(Date.leaked).toBeUndefined();
});

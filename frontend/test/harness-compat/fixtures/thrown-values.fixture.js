test("throws undefined", () => {
  throw undefined;
});
test("throws a string", () => {
  throw "a string";
});
test("rejects with undefined", () => Promise.reject(undefined));
test("returns a thenable", () => ({
  then: (resolve) => setTimeout(resolve, 1),
}));

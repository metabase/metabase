test("doMock applies to a later require", () => {
  jest.doMock("./helper-a", () => ({ name: "doMocked" }));
  expect(require("./helper-a").name).toBe("doMocked");
});
test("a virtual mock resolves", () => {
  jest.mock("not-a-real-package-xyz", () => ({ virtual: true }), {
    virtual: true,
  });
  expect(require("not-a-real-package-xyz").virtual).toBe(true);
});
test("requireMock gives the mock", () => {
  jest.doMock("./helper-a", () => ({ name: "for requireMock" }));
  expect(jest.requireMock("./helper-a").name).toBe("for requireMock");
});

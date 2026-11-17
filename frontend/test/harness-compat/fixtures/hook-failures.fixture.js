const log = [];
describe("a beforeEach that throws", () => {
  beforeEach(() => {
    throw new Error("beforeEach boom");
  });
  afterEach(() => log.push("afterEach after a failed beforeEach"));
  test("does not run its body", () => log.push("body"));
});
describe("an afterEach that throws", () => {
  afterEach(() => {
    throw new Error("afterEach boom");
  });
  test("fails", () => {});
});
describe("an afterAll after a failed beforeAll", () => {
  beforeAll(() => {
    throw new Error("beforeAll boom");
  });
  afterAll(() => log.push("afterAll runs"));
  test("fails", () => {});
});
test("checks the log", () => {
  expect(log).toEqual(["afterEach after a failed beforeEach", "afterAll runs"]);
});

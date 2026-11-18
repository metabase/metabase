describe("nested beforeAll throws", () => {
  beforeAll(() => {
    throw new Error("beforeAll boom");
  });
  it("fails because of its beforeAll", () => {
    expect(1).toBe(1);
  });
});

describe("nested afterAll throws", () => {
  afterAll(() => {
    throw new Error("afterAll boom");
  });
  it("passes before its afterAll fails", () => {
    expect(1).toBe(1);
  });
});

it("passes", () => {
  expect(1).toBe(1);
});

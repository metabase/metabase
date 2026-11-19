const log = [];
beforeAll(() => log.push("root beforeAll"));
beforeEach(() => log.push("root beforeEach"));
afterEach(() => log.push("root afterEach"));
afterAll(() => {
  log.push("root afterAll");
  expect(log).toEqual([
    "root beforeAll",
    "root beforeEach",
    "outer beforeAll",
    "root beforeEach",
    "outer beforeEach",
    "outer test",
    "outer afterEach",
    "root afterEach",
    "inner beforeAll",
    "root beforeEach",
    "outer beforeEach",
    "inner beforeEach",
    "inner test",
    "inner afterEach",
    "outer afterEach",
    "root afterEach",
    "inner afterAll",
    "outer afterAll",
    "root afterAll",
  ]);
});
test("first", () => log.push("root test"));
describe("outer", () => {
  beforeAll(() => log.push("outer beforeAll"));
  beforeEach(() => log.push("outer beforeEach"));
  afterEach(() => log.push("outer afterEach"));
  afterAll(() => log.push("outer afterAll"));
  test("outer test", () => log.push("outer test"));
  describe("inner", () => {
    beforeAll(() => log.push("inner beforeAll"));
    beforeEach(() => log.push("inner beforeEach"));
    afterEach(() => log.push("inner afterEach"));
    afterAll(() => log.push("inner afterAll"));
    test("inner test", () => log.push("inner test"));
  });
});

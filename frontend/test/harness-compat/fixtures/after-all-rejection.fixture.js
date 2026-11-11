afterAll(() => {
  Promise.reject(new Error("rejection in afterAll"));
});
test("passes", () => {});

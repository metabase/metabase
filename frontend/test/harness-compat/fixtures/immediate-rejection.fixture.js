test("fails on an immediate rejection", () => {
  Promise.reject(new Error("immediate rejection"));
});

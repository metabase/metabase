test("passes", () => {});

test("fails on a rejection that it waits past", async () => {
  Promise.reject(new Error("awaited rejection"));
  await new Promise((resolve) => setTimeout(resolve, 20));
});

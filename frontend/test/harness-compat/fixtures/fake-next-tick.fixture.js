test("fails because jest fakes nextTick with the clock", async () => {
  jest.useFakeTimers();
  await new Promise((resolve) => process.nextTick(resolve));
}, 100);

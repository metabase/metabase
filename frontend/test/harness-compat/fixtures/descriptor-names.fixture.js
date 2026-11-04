function MyComponent() {}
describe(MyComponent, () => {
  test(123, () => {
    expect(expect.getState().currentTestName).toBe("MyComponent 123");
  });
});

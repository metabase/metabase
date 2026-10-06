describe("smoke", () => {
  it("has a DOM and jest globals", () => {
    document.body.innerHTML = "<p>hi</p>";
    expect(document.querySelector("p")?.textContent).toBe("hi");
    expect(jest.fn()).not.toHaveBeenCalled();
  });
  it.each([[1, 2], [3, 4]])("each %s %s", (a, b) => { expect(b - a).toBe(1); });
});

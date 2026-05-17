import { resolveConcreteColor } from "./resolveConcreteColor";

describe("resolveConcreteColor", () => {
  it.each([
    // plain values
    { input: "#ff0000", scheme: "light", expected: "#ff0000" },
    { input: "rgb(255, 0, 0)", scheme: "light", expected: "rgb(255, 0, 0)" },
    { input: "", scheme: "light", expected: "" },
  ] as const)(
    "resolveConcreteColor($input, $scheme) → $expected",
    ({ input, scheme, expected }) => {
      expect(resolveConcreteColor(input, scheme)).toBe(expected);
    },
  );

  describe("var() values", () => {
    let appendSpy: jest.SpyInstance;
    let removeSpy: jest.SpyInstance;
    let getComputedStyleSpy: jest.SpyInstance;

    beforeEach(() => {
      appendSpy = jest
        .spyOn(document.body, "appendChild")
        .mockImplementation((el) => el as any);

      removeSpy = jest
        .spyOn(document.body, "removeChild")
        .mockImplementation((el) => el as any);
    });

    afterEach(() => {
      appendSpy.mockRestore();
      removeSpy.mockRestore();
      getComputedStyleSpy?.mockRestore();
    });

    it("resolves a var() reference via computed style", () => {
      getComputedStyleSpy = jest
        .spyOn(window, "getComputedStyle")
        .mockReturnValue({ color: "rgb(30, 30, 30)" } as CSSStyleDeclaration);

      expect(
        resolveConcreteColor("var(--vscode-editor-background)", "light"),
      ).toBe("rgb(30, 30, 30)");
    });

    it("falls back to original value when computed style returns empty", () => {
      getComputedStyleSpy = jest
        .spyOn(window, "getComputedStyle")
        .mockReturnValue({ color: "" } as CSSStyleDeclaration);

      expect(resolveConcreteColor("var(--unknown-variable)", "light")).toBe(
        "var(--unknown-variable)",
      );
    });
  });
});

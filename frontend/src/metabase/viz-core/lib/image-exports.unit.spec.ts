import { getSaveDomImageStyles } from "./image-exports";

const parseSelectors = (css: string) => {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  const selectors = Array.from(style.sheet?.cssRules ?? []).map((rule) =>
    rule instanceof CSSStyleRule ? rule.selectorText : rule.cssText,
  );
  style.remove();
  return selectors;
};

describe("getSaveDomImageStyles", () => {
  it("emits flat rules that parse without CSS nesting support", () => {
    expect(parseSelectors(getSaveDomImageStyles(false))).toEqual([
      ".saving-dom-image .saving-dom-image-hidden",
      ".saving-dom-image .saving-dom-image-display-none",
      ".saving-dom-image .saving-dom-image-overflow-visible",
      expect.stringMatching(/^\.saving-dom-image \[data-dashcard-key\]/),
    ]);
  });

  it("prefixes every rule with the scope, including the text overflow rule", () => {
    const selectors = parseSelectors(
      getSaveDomImageStyles(true, ".mb-wrapper"),
    );

    expect(selectors).toHaveLength(5);
    expect(
      selectors.every((selector) =>
        selector.startsWith(".mb-wrapper .saving-dom-image "),
      ),
    ).toBe(true);
  });
});

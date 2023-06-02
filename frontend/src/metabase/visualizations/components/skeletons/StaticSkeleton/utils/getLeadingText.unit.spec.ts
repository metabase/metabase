import { getLeadingText } from "./getLeadingText";
import { createHeading, createImage, createParagraph } from "./test-utils";

describe("getLeadingText", () => {
  it("extracts leading text from sole elements", () => {
    const h1 = createHeading("Lorem ipsum 1");
    const p = createParagraph("Lorem ipsum 2");

    expect(getLeadingText([h1])).toBe(h1.textContent);
    expect(getLeadingText([p])).toBe(p.textContent);
  });

  it("extracts leading text from a mix of h1 and p", () => {
    const h1 = createHeading("Lorem ipsum 1");
    const p = createParagraph("Lorem ipsum 2");

    expect(getLeadingText([h1, p])).toBe(h1.textContent);
    expect(getLeadingText([p, h1])).toBe(p.textContent);
  });

  it("skips elements without content", () => {
    const h1 = createHeading("");
    const p = createParagraph("Lorem ipsum");
    const img = createImage();

    expect(getLeadingText([p, img, h1])).toBe(p.textContent);
    expect(getLeadingText([h1, p, img])).toBe(p.textContent);
    expect(getLeadingText([img, h1, p])).toBe(p.textContent);
  });

  it("extracts an empty string when no element has any content", () => {
    const h1 = createHeading("");
    const p = createParagraph("");
    const img = createImage();

    expect(getLeadingText([h1])).toBe("");
    expect(getLeadingText([p])).toBe("");
    expect(getLeadingText([img])).toBe("");
    expect(getLeadingText([h1, img, p])).toBe("");
    expect(getLeadingText([])).toBe("");
  });
});

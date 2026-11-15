import { sanitizeRichTextContent } from "./style.rich";

describe("sanitizeRichTextContent", () => {
  it("removes rich-text control characters", () => {
    expect(sanitizeRichTextContent("a{b|c}")).toBe("abc");
    expect(sanitizeRichTextContent("Europe}}")).toBe("Europe");
    expect(sanitizeRichTextContent(String.raw`back\slash`)).toBe(
      String.raw`back\slash`,
    );
  });
});

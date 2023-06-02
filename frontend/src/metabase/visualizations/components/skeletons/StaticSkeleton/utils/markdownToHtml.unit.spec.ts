import { markdownToHtml } from "./markdownToHtml";
import { createHeading, createParagraph } from "./test-utils";

describe("markdownToHtml", () => {
  it("handles empty input", () => {
    expect(markdownToHtml("")).toEqual([]);
  });

  it("converts a sole element", () => {
    expect(markdownToHtml("# Lorem ipsum")).toEqual([
      createHeading("Lorem ipsum"),
    ]);

    expect(markdownToHtml("Lorem ipsum")).toEqual([
      createParagraph("Lorem ipsum"),
    ]);
  });
});

import { convertMarkdownToHtml } from "./convertMarkdownToHtml";
import { createHeading, createParagraph } from "./test-utils";

describe("convertMarkdownToHtml", () => {
  it("handles an empty input", () => {
    expect(convertMarkdownToHtml("")).toEqual([]);
  });

  it("converts a sole element", () => {
    expect(convertMarkdownToHtml("# Lorem ipsum")).toEqual([
      createHeading("Lorem ipsum"),
    ]);

    expect(convertMarkdownToHtml("Lorem ipsum")).toEqual([
      createParagraph("Lorem ipsum"),
    ]);
  });

  it("converts a mix of h1 and p", () => {
    expect(
      convertMarkdownToHtml(["# Lorem ipsum 1", "Lorem ipsum 2"].join("\n")),
    ).toEqual([
      createHeading("Lorem ipsum 1"),
      createParagraph("Lorem ipsum 2"),
    ]);

    expect(
      convertMarkdownToHtml(["Lorem ipsum 1", "# Lorem ipsum 2"].join("\n")),
    ).toEqual([
      createParagraph("Lorem ipsum 1"),
      createHeading("Lorem ipsum 2"),
    ]);
  });
});

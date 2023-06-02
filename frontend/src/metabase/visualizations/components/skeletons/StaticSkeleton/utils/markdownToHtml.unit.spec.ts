import { markdownToHtml } from "./markdownToHtml";
import { createHeading, createParagraph } from "./test-utils";

describe("markdownToHtml", () => {
  it("handles an empty input", () => {
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

  it("converts a mix of h1 and p", () => {
    expect(
      markdownToHtml(["# Lorem ipsum 1", "Lorem ipsum 2"].join("\n")),
    ).toEqual([
      createHeading("Lorem ipsum 1"),
      createParagraph("Lorem ipsum 2"),
    ]);

    expect(
      markdownToHtml(["Lorem ipsum 1", "# Lorem ipsum 2"].join("\n")),
    ).toEqual([
      createParagraph("Lorem ipsum 1"),
      createHeading("Lorem ipsum 2"),
    ]);
  });
});

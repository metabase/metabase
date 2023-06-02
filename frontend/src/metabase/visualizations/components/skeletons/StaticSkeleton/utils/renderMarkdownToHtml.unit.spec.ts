import { renderMarkdownToHtml } from "./renderMarkdownToHtml";
import { createHeading, createParagraph } from "./test-utils";

describe("renderMarkdownToHtml", () => {
  it("handles an empty input", () => {
    expect(renderMarkdownToHtml("")).toEqual([]);
  });

  it("renders a sole element", () => {
    expect(renderMarkdownToHtml("# Lorem ipsum")).toEqual([
      createHeading("Lorem ipsum"),
    ]);

    expect(renderMarkdownToHtml("Lorem ipsum")).toEqual([
      createParagraph("Lorem ipsum"),
    ]);
  });

  it("renders a mix of h1 and p", () => {
    expect(
      renderMarkdownToHtml(["# Lorem ipsum 1", "Lorem ipsum 2"].join("\n")),
    ).toEqual([
      createHeading("Lorem ipsum 1"),
      createParagraph("Lorem ipsum 2"),
    ]);

    expect(
      renderMarkdownToHtml(["Lorem ipsum 1", "# Lorem ipsum 2"].join("\n")),
    ).toEqual([
      createParagraph("Lorem ipsum 1"),
      createHeading("Lorem ipsum 2"),
    ]);
  });
});

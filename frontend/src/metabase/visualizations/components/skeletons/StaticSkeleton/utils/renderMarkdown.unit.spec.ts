import { renderMarkdown } from "./renderMarkdown";
import { createHeading, createParagraph } from "./test-utils";

describe("renderMarkdown", () => {
  it("handles an empty input", () => {
    expect(renderMarkdown("")).toEqual([]);
  });

  it("renders a sole element", () => {
    expect(renderMarkdown("# Lorem ipsum")).toEqual([
      createHeading("Lorem ipsum"),
    ]);

    expect(renderMarkdown("Lorem ipsum")).toEqual([
      createParagraph("Lorem ipsum"),
    ]);
  });

  it("renders a mix of h1 and p", () => {
    expect(
      renderMarkdown(["# Lorem ipsum 1", "Lorem ipsum 2"].join("\n")),
    ).toEqual([
      createHeading("Lorem ipsum 1"),
      createParagraph("Lorem ipsum 2"),
    ]);

    expect(
      renderMarkdown(["Lorem ipsum 1", "# Lorem ipsum 2"].join("\n")),
    ).toEqual([
      createParagraph("Lorem ipsum 1"),
      createHeading("Lorem ipsum 2"),
    ]);
  });
});

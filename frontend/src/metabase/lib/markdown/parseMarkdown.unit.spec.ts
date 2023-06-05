import { parseMarkdown } from "./parseMarkdown";
import { createHeading, createParagraph } from "./test-utils";

describe("parseMarkdown", () => {
  it("handles an empty input", () => {
    expect(parseMarkdown("")).toEqual([]);
  });

  it("renders a sole element", () => {
    expect(parseMarkdown("# Lorem ipsum")).toEqual([
      createHeading("Lorem ipsum"),
    ]);

    expect(parseMarkdown("Lorem ipsum")).toEqual([
      createParagraph("Lorem ipsum"),
    ]);
  });

  it("renders a mix of h1 and p", () => {
    expect(
      parseMarkdown(["# Lorem ipsum 1", "Lorem ipsum 2"].join("\n")),
    ).toEqual([
      createHeading("Lorem ipsum 1"),
      createParagraph("Lorem ipsum 2"),
    ]);

    expect(
      parseMarkdown(["Lorem ipsum 1", "# Lorem ipsum 2"].join("\n")),
    ).toEqual([
      createParagraph("Lorem ipsum 1"),
      createHeading("Lorem ipsum 2"),
    ]);
  });
});

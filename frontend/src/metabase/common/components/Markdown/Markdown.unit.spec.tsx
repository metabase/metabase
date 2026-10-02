import { render, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";

import { Markdown, type MarkdownProps } from "./Markdown";
import { KITCHEN_SINK_MARKDOWN } from "./kitchen-sink-markdown";

const KNOWN_ELEMENTS = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "input",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "strong",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
];

const setup = (props: MarkdownProps) => {
  render(
    <div data-testid="markdown-host">
      <Markdown {...props} />
    </div>,
  );

  return {
    root: checkNotNull(screen.getByTestId("markdown-host").firstElementChild),
  };
};

const getTagNames = (root: Element) => {
  const tagNames = [...root.querySelectorAll("*")].map((element) =>
    element.tagName.toLowerCase(),
  );

  return [...new Set(tagNames)].sort();
};

describe("Markdown", () => {
  it("does not emit elements outside the set the stylesheet accounts for", () => {
    const { root } = setup({ children: KITCHEN_SINK_MARKDOWN });

    const tagNames = getTagNames(root);

    expect(tagNames).toContain("table");
    expect(
      tagNames.filter((tagName) => !KNOWN_ELEMENTS.includes(tagName)),
    ).toEqual([]);
  });

  it("opens links in a new tab", () => {
    setup({ children: "A [link](https://metabase.test)." });

    const link = screen.getByRole("link", { name: "link" });

    expect(link).toHaveAttribute("href", "https://metabase.test");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("keeps metabase:// urls", () => {
    setup({ children: "A [link](metabase://question/1)." });

    expect(screen.getByRole("link", { name: "link" })).toHaveAttribute(
      "href",
      "metabase://question/1",
    );
  });

  it("keeps base64 image data uris", () => {
    const src = "data:image/png;base64,iVBORw0KGgo=";
    const { root } = setup({ children: `![Chart](${src})` });

    expect(root.querySelector("img")).toHaveAttribute("src", src);
  });

  it("strips unsafe url protocols", () => {
    const { root } = setup({ children: "A [link](javascript:alert(1))." });

    expect(root.querySelector("a")).toHaveAttribute("href", "");
  });

  it("escapes raw html instead of rendering it", () => {
    const { root } = setup({
      children: "Before <script>window.x = 1</script> after",
    });

    expect(root.querySelector("script")).toBeNull();
    expect(screen.getByText(/window.x = 1/)).toBeInTheDocument();
  });

  it("wraps tables in their own container so they can scroll", () => {
    const { root } = setup({
      children: "| A | B |\n| --- | --- |\n| 1 | 2 |",
    });

    const table = checkNotNull(root.querySelector("table"));
    const wrapper = checkNotNull(table.parentElement);

    expect(wrapper.tagName).toBe("DIV");
    expect(wrapper).not.toBe(root);
    expect(wrapper.parentElement).toBe(root);
  });

  it("lets call sites replace the table wrapper", () => {
    const { root } = setup({
      children: "| A | B |\n| --- | --- |\n| 1 | 2 |",
      components: { table: "table" },
    });

    const table = checkNotNull(root.querySelector("table"));

    expect(table.parentElement).toBe(root);
  });

  it("renders headings as paragraphs when they are disallowed", () => {
    const { root } = setup({
      children: "# Title\n\nBody",
      disallowHeading: true,
    });

    expect(root.querySelector("h1")).toBeNull();
    expect(screen.getByText("Title").tagName).toBe("P");
  });
});

import { render, screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";

import { Markdown, type MarkdownProps } from "./Markdown";
import { KITCHEN_SINK_MARKDOWN } from "./kitchen-sink-markdown";

const STYLED_ELEMENTS = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
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
  const { container } = render(<Markdown {...props} />);

  return { root: checkNotNull(container.firstElementChild) };
};

const getRenderedTagNames = (root: Element) => {
  const tagNames = [...root.querySelectorAll("*")].map((element) =>
    element.tagName.toLowerCase(),
  );

  return [...new Set(tagNames)].sort();
};

describe("Markdown", () => {
  it("does not emit elements the shared stylesheet leaves unstyled", () => {
    const { root } = setup({ children: KITCHEN_SINK_MARKDOWN });

    const unstyled = getRenderedTagNames(root).filter(
      (tagName) => !STYLED_ELEMENTS.includes(tagName),
    );

    expect(unstyled).toEqual([]);
  });

  it("renders every block construct of the kitchen sink", () => {
    const { root } = setup({ children: KITCHEN_SINK_MARKDOWN });

    expect(getRenderedTagNames(root)).toEqual(
      expect.arrayContaining([
        "blockquote",
        "code",
        "del",
        "hr",
        "img",
        "li",
        "ol",
        "pre",
        "strong",
        "table",
        "td",
        "th",
        "ul",
      ]),
    );
  });

  it("renders task list checkboxes", () => {
    setup({ children: KITCHEN_SINK_MARKDOWN });

    const checkboxes = screen.getAllByRole("checkbox");

    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it("renders nested lists inside list items", () => {
    const { root } = setup({ children: KITCHEN_SINK_MARKDOWN });

    const nestedList = checkNotNull(
      root.querySelector<HTMLUListElement>("li > ul"),
    );

    expect(within(nestedList).getAllByRole("listitem")).toHaveLength(2);
  });

  it("opens links in a new tab", () => {
    setup({ children: "A [link](https://metabase.test)." });

    const link = screen.getByRole("link", { name: "link" });

    expect(link).toHaveAttribute("href", "https://metabase.test");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("escapes raw html instead of rendering it", () => {
    const { root } = setup({
      children: "Before <script>window.x = 1</script> after",
    });

    expect(root.querySelector("script")).toBeNull();
    expect(screen.getByText(/window.x = 1/)).toBeInTheDocument();
  });

  it("unwraps headings when they are disallowed", () => {
    const { root } = setup({
      children: "# Title\n\nBody",
      disallowHeading: true,
    });

    expect(root.querySelector("h1")).toBeNull();
    expect(screen.getByText("Title")).toBeInTheDocument();
  });

  it("marks compact rendering on the root", () => {
    const { root } = setup({ children: "Text", compact: true });

    expect(root).toHaveAttribute("data-compact", "true");
  });
});

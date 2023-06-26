import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MarkdownPreview } from "./MarkdownPreview";

const HEADING_1_TEXT = "Heading 1";
const HEADING_1_MARKDOWN = `# ${HEADING_1_TEXT}`;
const HEADING_2_TEXT = "Heading 2";
const HEADING_2_MARKDOWN = `## ${HEADING_2_TEXT}`;
const PARAGRAPH_TEXT = "Paragraph with link";
const PARAGRAPH_MARKDOWN = "Paragraph with [link](https://example.com)";
const IMAGE_MARKDOWN = "![alt](https://example.com/img.jpg)";
const MARKDOWN = [
  IMAGE_MARKDOWN,
  HEADING_1_MARKDOWN,
  HEADING_2_MARKDOWN,
  PARAGRAPH_MARKDOWN,
].join("\n\n");
const MARKDOWN_AS_TEXT = [HEADING_1_TEXT, HEADING_2_TEXT, PARAGRAPH_TEXT].join(
  " ",
);

interface SetupOpts {
  markdown?: string;
}

const setup = ({ markdown = MARKDOWN }: SetupOpts = {}) => {
  render(<MarkdownPreview>{markdown}</MarkdownPreview>);
};

describe("MarkdownPreview", () => {
  it("should render markdown as plain text in the preview", () => {
    setup();

    expect(screen.getByText(MARKDOWN_AS_TEXT)).toBeInTheDocument();
  });

  it("should show tooltip with markdown formatting on hover", () => {
    setup();

    userEvent.hover(screen.getByText(MARKDOWN_AS_TEXT));

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).not.toHaveTextContent(MARKDOWN);
    expect(tooltip).not.toHaveTextContent(HEADING_1_MARKDOWN);
    expect(tooltip).not.toHaveTextContent(HEADING_2_MARKDOWN);
    expect(tooltip).toHaveTextContent(MARKDOWN_AS_TEXT);

    const image = within(tooltip).getByRole("img");
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("alt", "alt");
    expect(image).toHaveAttribute("src", "https://example.com/img.jpg");
  });
});

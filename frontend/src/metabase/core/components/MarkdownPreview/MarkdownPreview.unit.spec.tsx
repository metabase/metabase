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

  it("should not show tooltip with markdown formatting on hover when text is not truncated", async () => {
    setup();

    await userEvent.hover(screen.getByText(MARKDOWN_AS_TEXT));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  describe("Tooltip on ellipsis", () => {
    const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    const rangeGetBoundingClientRect = Range.prototype.getBoundingClientRect;

    beforeAll(() => {
      // Mock return values so that getIsTruncated can kick in
      HTMLElement.prototype.getBoundingClientRect = jest
        .fn()
        .mockReturnValue({ height: 1, width: 1 });
      Range.prototype.getBoundingClientRect = jest
        .fn()
        .mockReturnValue({ height: 1, width: 2 });
    });

    afterAll(() => {
      HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect;
      Range.prototype.getBoundingClientRect = rangeGetBoundingClientRect;

      jest.resetAllMocks();
    });

    it("should show tooltip with markdown formatting on hover when text is truncated", async () => {
      setup();

      await userEvent.hover(screen.getByText(MARKDOWN_AS_TEXT));

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
});

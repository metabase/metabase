import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import SkeletonCaption from "./SkeletonCaption";

const HEADING_1_TEXT = "Heading 1";
const HEADING_1_MARKDOWN = `# ${HEADING_1_TEXT}`;
const HEADING_2_TEXT = "Heading 2";
const HEADING_2_MARKDOWN = `## ${HEADING_2_TEXT}`;
const PARAGRAPH_TEXT = "Paragraph with link";
const PARAGRAPH_MARKDOWN = "Paragraph with [link](https://example.com)";
const MARKDOWN = [
  HEADING_1_MARKDOWN,
  HEADING_2_MARKDOWN,
  PARAGRAPH_MARKDOWN,
].join("\n\n");
const MARKDOWN_AS_TEXT = [HEADING_1_TEXT, HEADING_2_TEXT, PARAGRAPH_TEXT].join(
  " ",
);

function setup({ description }: { description?: string } = {}) {
  return renderWithProviders(<SkeletonCaption description={description} />);
}

describe("SkeletonCaption", () => {
  it("should show description tooltip with markdown formatting", () => {
    setup({ description: MARKDOWN });

    userEvent.hover(screen.getByTestId("skeleton-description-icon"));

    const tooltip = screen.getByRole("tooltip");

    expect(tooltip).not.toHaveTextContent(MARKDOWN);
    expect(tooltip).not.toHaveTextContent(HEADING_1_MARKDOWN);
    expect(tooltip).not.toHaveTextContent(HEADING_2_MARKDOWN);
    expect(tooltip).toHaveTextContent(MARKDOWN_AS_TEXT);
  });
});

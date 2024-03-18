import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import StaticSkeleton from "./StaticSkeleton";

const HEADING_1_TEXT = "Heading 1";
const HEADING_1_MARKDOWN = `# ${HEADING_1_TEXT}`;
const HEADING_2_TEXT = "Heading 2";
const HEADING_2_MARKDOWN = `## ${HEADING_2_TEXT}`;
const PARAGRAPH_TEXT = "Paragraph with link";
const PARAGRAPH_MARKDOWN = "Paragraph with [link](https://example.com)";
const IMAGE_MARKDOWN = "![alt](https://example.com/img.jpg)";
const MARKDOWN = [
  HEADING_1_MARKDOWN,
  HEADING_2_MARKDOWN,
  PARAGRAPH_MARKDOWN,
  IMAGE_MARKDOWN,
].join("\n\n");
const MARKDOWN_AS_TEXT = [HEADING_1_TEXT, HEADING_2_TEXT, PARAGRAPH_TEXT].join(
  " ",
);

function setup({ description }: { description?: string } = {}) {
  return renderWithProviders(<StaticSkeleton description={description} />);
}

describe("StaticSkeleton", () => {
  describe("description", () => {
    const originalScrollWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollWidth",
    );

    beforeAll(() => {
      // emulate ellipsis
      Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
        configurable: true,
        value: 100,
      });
    });

    afterAll(() => {
      if (originalScrollWidth) {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollWidth",
          originalScrollWidth,
        );
      }
    });

    it("should render description markdown as plain text", () => {
      setup({ description: MARKDOWN });

      expect(screen.getByText(MARKDOWN_AS_TEXT)).toBeInTheDocument();
    });

    it("should show description tooltip with markdown formatting on hover", async () => {
      setup({ description: MARKDOWN });

      await userEvent.hover(screen.getByText(MARKDOWN_AS_TEXT));

      expect(screen.getByRole("tooltip")).toHaveTextContent(MARKDOWN_AS_TEXT);
    });
  });
});

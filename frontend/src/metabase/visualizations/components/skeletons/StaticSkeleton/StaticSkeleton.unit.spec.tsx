import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import StaticSkeleton from "./StaticSkeleton";

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
const HEADING_SHORT_TEXT = "Short description";
const HEADING_SHORT_MARKDOWN = `# ${HEADING_SHORT_TEXT}`;
const HEADING_LONG_TEXT =
  "This is a very long description that will require visual truncation in the user interface";
const HEADING_LONG_MARKDOWN = `# ${HEADING_LONG_TEXT}`;

function setup({ description }: { description?: string } = {}) {
  return renderWithProviders(<StaticSkeleton description={description} />);
}

describe("StaticSkeleton", () => {
  describe("description", () => {
    it("should show only the first line of description without markdown formatting", () => {
      setup({ description: MARKDOWN });

      expect(screen.getByText(HEADING_1_TEXT)).toBeInTheDocument();
      expect(screen.queryByText(HEADING_1_MARKDOWN)).not.toBeInTheDocument();
      expect(screen.queryByText(HEADING_2_MARKDOWN)).not.toBeInTheDocument();
      expect(screen.queryByText(HEADING_2_TEXT)).not.toBeInTheDocument();
      expect(screen.queryByText(PARAGRAPH_MARKDOWN)).not.toBeInTheDocument();
      expect(screen.queryByText(PARAGRAPH_TEXT)).not.toBeInTheDocument();
    });

    it("should show description tooltip with markdown formatting", () => {
      setup({ description: MARKDOWN });

      userEvent.hover(screen.getByText(HEADING_1_TEXT));

      const tooltip = screen.getByRole("tooltip");

      expect(tooltip).not.toHaveTextContent(MARKDOWN);
      expect(tooltip).not.toHaveTextContent(HEADING_1_MARKDOWN);
      expect(tooltip).not.toHaveTextContent(HEADING_2_MARKDOWN);
      expect(tooltip).toHaveTextContent(MARKDOWN_AS_TEXT);
    });

    it("should not show description tooltip when ellipis is not necessary", async () => {
      setup({ description: HEADING_SHORT_MARKDOWN });

      userEvent.hover(screen.getByText(HEADING_SHORT_TEXT));

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    describe("ellipsis", () => {
      // mocking scrollWidth to simulate ellipsis
      const originalScrollWidth = Object.getOwnPropertyDescriptor(
        Element.prototype,
        "scrollWidth",
      );

      if (typeof originalScrollWidth === "undefined") {
        throw new Error("Element.prototype.scrollWidth is undefined");
      }

      beforeAll(() => {
        Object.defineProperty(Element.prototype, "scrollWidth", {
          configurable: true,
          get() {
            if (this.textContent === HEADING_LONG_TEXT) {
              return 1;
            }

            return 0;
          },
        });
      });

      afterAll(() => {
        Object.defineProperty(
          Element.prototype,
          "scrollWidth",
          originalScrollWidth,
        );
      });

      it("should show description tooltip when ellipis is necessary", async () => {
        setup({ description: HEADING_LONG_MARKDOWN });

        userEvent.hover(screen.getByText(HEADING_LONG_TEXT));

        await waitFor(() => {
          expect(screen.getByRole("tooltip")).toBeInTheDocument();
        });

        const tooltip = screen.getByRole("tooltip");

        expect(tooltip).toHaveAttribute("data-state", "visible");
        expect(tooltip).not.toHaveTextContent(HEADING_LONG_MARKDOWN);
        expect(tooltip).toHaveTextContent(HEADING_LONG_TEXT);
      });
    });
  });
});

import userEvent from "@testing-library/user-event";

import { render, screen, within } from "__support__/ui";

import StaticSkeleton from "./StaticSkeleton";

const IMAGE_MARKDOWN = "![alt](https://example.com/img.jpg)";
const HEADING_TEXT = "Heading text";
const HEADING_MARKDOWN = `# ${HEADING_TEXT}`;
const PARAGRAPH_MARKDOWN = "Paragraph text";
const MARKDOWN = [IMAGE_MARKDOWN, HEADING_MARKDOWN, PARAGRAPH_MARKDOWN].join(
  "\n",
);
const SHORT_DESCRIPTION = "Short description";

interface SetupOpts {
  description?: string;
  name?: string;
}

async function setup({
  description = MARKDOWN,
  name = "Lorem ipsum",
}: SetupOpts = {}) {
  render(
    <StaticSkeleton
      data-testid="static-skeleton"
      description={description}
      name={name}
    />,
  );
}

describe("StaticSkeleton", () => {
  it("renders only the first line of description and without markdown formatting", async () => {
    await setup();

    const staticSkeleton = screen.getByTestId("static-skeleton");

    expect(staticSkeleton).toBeInTheDocument();
    expect(staticSkeleton).toHaveTextContent(HEADING_TEXT);
    expect(staticSkeleton).not.toHaveTextContent(HEADING_MARKDOWN);
    expect(staticSkeleton).not.toHaveTextContent(PARAGRAPH_MARKDOWN);
  });

  it("shows description tooltip with markdown formatting on hover", async () => {
    await setup();

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    userEvent.hover(screen.getByText(HEADING_TEXT));

    const tooltip = screen.getByRole("tooltip");

    expect(tooltip).toBeInTheDocument();
    expect(tooltip).not.toBeEmptyDOMElement();
    expect(tooltip).not.toHaveTextContent(MARKDOWN);
    expect(within(tooltip).getByText(HEADING_TEXT).nodeName).toBe("H1");
    expect(within(tooltip).getByText(PARAGRAPH_MARKDOWN).nodeName).toBe("P");
  });

  it("does not show description tooltip when description is fully rendered", async () => {
    await setup({ description: SHORT_DESCRIPTION });

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    userEvent.hover(screen.getByText(SHORT_DESCRIPTION));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

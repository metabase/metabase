import userEvent from "@testing-library/user-event";
import { render, screen, within } from "__support__/ui";

import StaticSkeleton from "./StaticSkeleton";

const HEADING_TEXT = "Deserunt inventore ea tempora.";
const HEADING_MARKDOWN = `# ${HEADING_TEXT}`;
const PARAGRAPH_MARKDOWN = "Eum neque eum enim.";
const MARKDOWN = [HEADING_MARKDOWN, PARAGRAPH_MARKDOWN].join("\n");

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
  it("renders the first line of description without markdown formatting", async () => {
    await setup();

    const staticSkeleton = screen.getByTestId("static-skeleton");

    expect(staticSkeleton).toBeInTheDocument();
    expect(staticSkeleton).toHaveTextContent(HEADING_TEXT);
    expect(staticSkeleton).not.toHaveTextContent(HEADING_MARKDOWN);
    expect(staticSkeleton).not.toHaveTextContent(PARAGRAPH_MARKDOWN);
  });

  it("shows tooltip with formatted markdown on description hover", async () => {
    await setup();

    userEvent.hover(screen.getByText(HEADING_TEXT));

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).not.toBeEmptyDOMElement();
    expect(tooltip).not.toHaveTextContent(MARKDOWN);
    expect(within(tooltip).getByText(HEADING_TEXT).nodeName).toBe("H1");
    expect(within(tooltip).getByText(PARAGRAPH_MARKDOWN).nodeName).toBe("P");
  });
});

import { renderWithProviders, screen } from "__support__/ui";

import { EllipsifiedWithMarkdown } from "./EllipsifiedWithMarkdown";

const render = (children: string) => {
  renderWithProviders(
    <EllipsifiedWithMarkdown>{children}</EllipsifiedWithMarkdown>,
  );
};

describe("EllipsifiedWithMarkdown", () => {
  it("renders Markdown with text", () => {
    const exampleText = "Some example text to be ellipsified";
    render(exampleText);
    expect(screen.getByText(exampleText)).toBeInTheDocument();
  });

  it("replaces line breaks with spaces in displayed children", () => {
    const inputText = "Some example\ntext to be ellipsified";
    const expectedText = "Some example text to be ellipsified";
    render(inputText);
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });

  it("does not display headings", () => {
    const inputText = "# Header\nSome example text to be ellipsified";
    render(inputText);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});

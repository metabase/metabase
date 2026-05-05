import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { SnippetSidebarEmptyState } from "./SnippetSidebarEmptyState";

describe("SnippetSidebarEmptyState", () => {
  it("should render the empty state with Create snippet button", async () => {
    const onButtonClick = jest.fn();
    render(<SnippetSidebarEmptyState onClick={onButtonClick} />);

    expect(
      screen.getByRole("button", { name: "Create snippet" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Create snippet" }),
    );
    expect(onButtonClick).toHaveBeenCalled();
  });

  it("should not render the Create snippet button when snippets are read-only", () => {
    render(
      <SnippetSidebarEmptyState onClick={jest.fn()} areSnippetsReadOnly />,
    );

    expect(
      screen.queryByRole("button", { name: "Create snippet" }),
    ).not.toBeInTheDocument();
  });
});

import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { CopyTextArea } from "./CopyTextArea";

describe("CopyTextArea", () => {
  it("copies the value and calls onCopied when clicking the copy button", async () => {
    jest.mocked(navigator.clipboard.writeText).mockClear();
    const onCopied = jest.fn();
    renderWithProviders(
      <CopyTextArea value="npx run --a --b" onCopied={onCopied} />,
    );

    await userEvent.click(screen.getByTestId("copy-button"));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "npx run --a --b",
    );
    expect(onCopied).toHaveBeenCalled();
  });

  it("does not render the copy button when there is nothing to copy", () => {
    renderWithProviders(<CopyTextArea value="" placeholder="Loading…" />);

    expect(screen.getByPlaceholderText("Loading…")).toBeInTheDocument();
    expect(screen.queryByTestId("copy-button")).not.toBeInTheDocument();
  });
});

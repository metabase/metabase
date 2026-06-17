import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { CopyTextInput } from "./CopyTextInput";

describe("CopyTextInput", () => {
  it("copies the value and calls onCopy when clicking the copy button", async () => {
    jest.mocked(navigator.clipboard.writeText).mockClear();
    const onCopied = jest.fn();
    renderWithProviders(
      <CopyTextInput value="https://example.com" onCopied={onCopied} />,
    );

    await userEvent.click(screen.getByTestId("copy-button"));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "https://example.com",
    );
    expect(onCopied).toHaveBeenCalled();
  });

  it("does not render the copy button when there is nothing to copy", () => {
    renderWithProviders(<CopyTextInput value="" placeholder="Loading…" />);

    expect(screen.getByPlaceholderText("Loading…")).toBeInTheDocument();
    expect(screen.queryByTestId("copy-button")).not.toBeInTheDocument();
  });
});

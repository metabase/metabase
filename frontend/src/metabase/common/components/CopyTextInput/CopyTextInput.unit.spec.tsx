import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { CopyTextInput } from "./CopyTextInput";

describe("CopyTextInput", () => {
  it("copies the value and calls onCopy when clicking the copy button", async () => {
    const onCopied = jest.fn();
    renderWithProviders(
      <CopyTextInput value="https://example.com" onCopied={onCopied} />,
    );

    await userEvent.click(screen.getByTestId("copy-button"));

    // The fast-test regime routes userEvent through its own clipboard stub
    // (writeText is not the global jest mock), so read the value back from it;
    // in stock mode the global mock records the write instead. Either way we
    // assert the exact value that was copied.
    const { writeText } = navigator.clipboard;
    if (jest.isMockFunction(writeText)) {
      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith("https://example.com"),
      );
    } else {
      await waitFor(async () =>
        expect(await navigator.clipboard.readText()).toBe(
          "https://example.com",
        ),
      );
    }
    expect(onCopied).toHaveBeenCalled();
  });

  it("does not render the copy button when there is nothing to copy", () => {
    renderWithProviders(<CopyTextInput value="" placeholder="Loading…" />);

    expect(screen.getByPlaceholderText("Loading…")).toBeInTheDocument();
    expect(screen.queryByTestId("copy-button")).not.toBeInTheDocument();
  });
});

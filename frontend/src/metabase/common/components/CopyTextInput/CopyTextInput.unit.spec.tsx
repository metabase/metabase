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
    // (writeText is not the global jest mock), so read the value back from
    // whichever clipboard is in effect, then assert unconditionally.
    const getCopiedText = async () => {
      const { writeText } = navigator.clipboard;
      return jest.isMockFunction(writeText)
        ? writeText.mock.calls.at(-1)?.[0]
        : navigator.clipboard.readText();
    };
    await waitFor(async () =>
      expect(await getCopiedText()).toBe("https://example.com"),
    );
    expect(onCopied).toHaveBeenCalled();
  });

  it("does not render the copy button when there is nothing to copy", () => {
    renderWithProviders(<CopyTextInput value="" placeholder="Loading…" />);

    expect(screen.getByPlaceholderText("Loading…")).toBeInTheDocument();
    expect(screen.queryByTestId("copy-button")).not.toBeInTheDocument();
  });
});

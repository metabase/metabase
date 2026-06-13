import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { CopyButton } from "./CopyButton";

describe("CopyButton", () => {
  beforeEach(() => {
    jest.mocked(navigator.clipboard.writeText).mockClear();
    jest.mocked(navigator.clipboard.write).mockClear();
  });

  it("copies a string value synchronously via writeText", async () => {
    renderWithProviders(<CopyButton value="hello" />);

    await userEvent.click(screen.getByTestId("copy-button"));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
    expect(navigator.clipboard.write).not.toHaveBeenCalled();
  });

  it("resolves and copies an async getter via the ClipboardItem path", async () => {
    const getValue = jest.fn(() => Promise.resolve("secret"));

    renderWithProviders(<CopyButton value={getValue} />);

    await userEvent.click(screen.getByTestId("copy-button"));

    expect(getValue).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalled());
    // The async path must not fall back to writeText (blocked by Safari after an await).
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("only resolves the value when clicked, never on render", () => {
    const getValue = jest.fn(() => Promise.resolve("secret"));

    renderWithProviders(<CopyButton value={getValue} />);

    expect(getValue).not.toHaveBeenCalled();
  });

  it("supports a custom data-testid", () => {
    renderWithProviders(<CopyButton value="hello" data-testid="my-copy" />);

    expect(screen.getByTestId("my-copy")).toBeInTheDocument();
  });
});

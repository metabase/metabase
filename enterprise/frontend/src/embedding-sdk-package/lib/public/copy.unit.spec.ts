import { copy } from "./copy";

describe("copy", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
  });

  function setClipboard(clipboard: Pick<Clipboard, "writeText"> | undefined) {
    Object.defineProperty(navigator, "clipboard", {
      value: clipboard,
      configurable: true,
    });
  }

  it("writes the text to the clipboard", async () => {
    const writeText = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
    setClipboard({ writeText });

    await copy("data-app-clipboard-payload");

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("data-app-clipboard-payload");
  });

  it("rejects when the clipboard is unavailable", async () => {
    setClipboard(undefined);

    await expect(copy("text")).rejects.toThrow(
      "Clipboard write is unavailable",
    );
  });
});

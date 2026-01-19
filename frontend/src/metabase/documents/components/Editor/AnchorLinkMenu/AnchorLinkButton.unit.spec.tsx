import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { AnchorLinkButton } from "./AnchorLinkButton";

const mockCopy = jest.fn();
const mockClipboard = {
  copy: mockCopy,
  copied: false,
};

jest.mock("@mantine/hooks", () => ({
  ...jest.requireActual("@mantine/hooks"),
  useClipboard: () => mockClipboard,
}));

describe("AnchorLinkButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClipboard.copied = false;
  });

  it("renders a link icon button", () => {
    render(<AnchorLinkButton url="http://example.com/document/1#block-123" />);

    const button = screen.getByRole("button", { name: /copy link/i });
    expect(button).toBeInTheDocument();
  });

  it("copies URL to clipboard on click", async () => {
    const url = "http://example.com/document/1#block-123";
    render(<AnchorLinkButton url={url} />);

    const button = screen.getByRole("button", { name: /copy link/i });
    await userEvent.click(button);

    expect(mockCopy).toHaveBeenCalledWith(url);
  });

  it("copies URL to clipboard on Enter key", async () => {
    const user = userEvent.setup();
    const url = "http://example.com/document/1#block-123";
    render(<AnchorLinkButton url={url} />);

    await user.tab();
    await user.keyboard("{Enter}");

    expect(mockCopy).toHaveBeenCalledWith(url);
  });

  it("copies URL to clipboard on Space key", async () => {
    const user = userEvent.setup();
    const url = "http://example.com/document/1#block-123";
    render(<AnchorLinkButton url={url} />);

    await user.tab();
    await user.keyboard(" ");

    expect(mockCopy).toHaveBeenCalledWith(url);
  });

  it("shows 'Copied!' tooltip after click", async () => {
    mockClipboard.copied = true;
    const url = "http://example.com/document/1#block-123";
    render(<AnchorLinkButton url={url} />);

    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });

  it("calls onCopy callback when provided", async () => {
    const onCopy = jest.fn();
    const url = "http://example.com/document/1#block-123";
    render(<AnchorLinkButton url={url} onCopy={onCopy} />);

    const button = screen.getByRole("button", { name: /copy link/i });
    await userEvent.click(button);

    expect(onCopy).toHaveBeenCalled();
  });
});

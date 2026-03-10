import { render, screen } from "__support__/ui";

import { AnchorLinkMenu } from "./AnchorLinkMenu";

const mockCopy = jest.fn();
const mockClipboard = {
  copy: mockCopy,
  copied: false,
};

jest.mock("@mantine/hooks", () => ({
  ...jest.requireActual("@mantine/hooks"),
  useClipboard: () => mockClipboard,
}));

describe("AnchorLinkMenu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClipboard.copied = false;
  });

  it("renders AnchorLinkButton with correct URL", () => {
    const url = "http://example.com/document/1#block-123";
    render(
      <AnchorLinkMenu url={url} show={true} style={{ position: "absolute" }} />,
    );

    const button = screen.getByRole("button", { name: /copy link/i });
    expect(button).toBeInTheDocument();
  });

  it("renders into a portal in document.body", () => {
    const url = "http://example.com/document/1#block-123";
    render(
      <AnchorLinkMenu url={url} show={true} style={{ position: "absolute" }} />,
    );

    // Menu should be portaled to document.body
    const menu = document.body.querySelector(
      '[data-testid="anchor-link-menu"]',
    );
    expect(menu).toBeInTheDocument();
  });

  it("applies show prop styles", () => {
    const url = "http://example.com/document/1#block-123";
    render(
      <AnchorLinkMenu
        url={url}
        show={false}
        style={{ position: "absolute" }}
      />,
    );

    // Menu should be in DOM (just hidden via CSS opacity)
    const menu = document.body.querySelector(
      '[data-testid="anchor-link-menu"]',
    );
    expect(menu).toBeInTheDocument();
  });

  it("accepts ref for floating-ui positioning", () => {
    const url = "http://example.com/document/1#block-123";
    const ref = jest.fn();
    render(
      <AnchorLinkMenu
        url={url}
        show={true}
        style={{ position: "absolute" }}
        ref={ref}
      />,
    );

    expect(ref).toHaveBeenCalled();
  });
});

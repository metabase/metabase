import { useClipboard } from "@mantine/hooks";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { renderWithProviders, screen } from "__support__/ui";

import { CopyButton } from "./CopyButton";

jest.mock("@mantine/hooks", () => ({
  ...jest.requireActual("@mantine/hooks"),
  useClipboard: jest.fn(),
}));

const mockUseClipboard = jest.mocked(useClipboard);

interface SetupOpts {
  copied?: boolean;
  ariaLabel?: string;
  target?: ReactNode;
}

const setup = ({ copied = false, ariaLabel, target }: SetupOpts = {}) => {
  const copy = jest.fn();
  const onCopy = jest.fn();
  mockUseClipboard.mockReturnValue({
    copy,
    copied,
    reset: jest.fn(),
    error: null,
  });

  renderWithProviders(
    <CopyButton
      value="some value"
      onCopy={onCopy}
      aria-label={ariaLabel}
      target={target}
    />,
  );

  return { copy, onCopy };
};

describe("CopyButton", () => {
  it("renders a button named 'Copy' by default", () => {
    setup();

    expect(screen.getByRole("button", { name: "Copy" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("copies the value on click", async () => {
    const { copy, onCopy } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(copy).toHaveBeenCalledWith("some value");
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it("uses a custom aria-label", () => {
    setup({ ariaLabel: "Copy link" });

    expect(
      screen.getByRole("button", { name: "Copy link" }),
    ).toBeInTheDocument();
  });

  it("is named by a custom target's content", () => {
    setup({ target: <span>Copy manifest</span> });

    expect(
      screen.getByRole("button", { name: "Copy manifest" }),
    ).toBeInTheDocument();
  });

  it("announces a successful copy", () => {
    setup({ copied: true });

    expect(screen.getByRole("status")).toHaveTextContent("Copied!");
  });

  it("announces nothing before copying", () => {
    setup();

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

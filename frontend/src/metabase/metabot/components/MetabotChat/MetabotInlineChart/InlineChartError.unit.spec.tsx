import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { InlineChartError } from "./InlineChartError";
import type { ChartError } from "./utils";

const RAW_ERROR =
  "ORDER BY does not support expressions of type ARRAY<STRING> at [1:198]";

function setup(error: Partial<ChartError> = {}) {
  renderWithProviders(
    <InlineChartError
      error={{
        message: "There was a problem displaying this chart.",
        icon: "warning",
        ...error,
      }}
    />,
  );
}

describe("InlineChartError", () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(
    navigator,
    "clipboard",
  );

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", originalClipboard);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("shows the message with its icon", () => {
    setup({
      message: "Sorry, you don't have permission to see this card.",
      icon: "key",
    });
    expect(
      screen.getByText("Sorry, you don't have permission to see this card."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("key icon")).toBeInTheDocument();
  });

  it("does not offer Details without a database error", () => {
    setup();
    expect(
      screen.queryByRole("button", { name: "Details" }),
    ).not.toBeInTheDocument();
  });

  it("reveals the database error behind Details", async () => {
    setup({ details: RAW_ERROR });
    const toggle = screen.getByRole("button", { name: "Details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(RAW_ERROR)).not.toBeVisible();

    await userEvent.click(toggle);

    await waitFor(() => expect(screen.getByText(RAW_ERROR)).toBeVisible());
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("copies the database error", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    setup({ details: RAW_ERROR });

    await userEvent.click(screen.getByRole("button", { name: "Details" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Copy error" }),
    );

    expect(writeText).toHaveBeenCalledWith(RAW_ERROR);
  });
});

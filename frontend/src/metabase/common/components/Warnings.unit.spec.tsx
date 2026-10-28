import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";

import { Warnings } from "./Warnings";

const WARNINGS = ["Data truncated to 2 rows.", "Some values are missing."];
const NEGATIVE_COLOR = "var(--mantine-color-feedback-negative-text)";

type SetupOpts = {
  warnings?: string[];
  severity?: "warning" | "error";
  isClickable?: boolean;
};

function setup({
  warnings = WARNINGS,
  severity,
  isClickable = false,
}: SetupOpts = {}) {
  const onClick = jest.fn<void, []>();

  renderWithProviders(
    <Warnings
      warnings={warnings}
      severity={severity}
      onClick={isClickable ? onClick : undefined}
    />,
  );

  return { onClick };
}

describe("Warnings", () => {
  it("renders nothing without warnings", () => {
    setup({ warnings: [] });

    expect(screen.queryByLabelText("warning icon")).not.toBeInTheDocument();
  });

  it("lists every warning in the tooltip of a gray icon", async () => {
    setup();

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByLabelText("warning icon")).not.toHaveStyle({
      color: NEGATIVE_COLOR,
    });

    await userEvent.hover(screen.getByLabelText("warning icon"));

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText(WARNINGS[0])).toBeInTheDocument();
    expect(within(tooltip).getByText(WARNINGS[1])).toBeInTheDocument();
  });

  it("shows a red icon for errors", () => {
    setup({ severity: "error" });

    expect(screen.getByLabelText("warning icon")).toHaveStyle({
      color: NEGATIVE_COLOR,
    });
  });

  it("describes a clickable icon with its warnings and calls back on click", async () => {
    const { onClick } = setup({ warnings: [WARNINGS[0]], isClickable: true });

    const button = screen.getByRole("button", { name: "Warnings" });
    expect(button).toHaveAccessibleDescription(WARNINGS[0]);

    await userEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

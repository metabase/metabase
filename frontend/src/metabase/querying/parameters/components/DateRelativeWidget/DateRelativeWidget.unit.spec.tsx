import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { DateRelativeWidget } from "./DateRelativeWidget";

type SetupOpts = {
  value?: string;
};

function setup({ value }: SetupOpts = {}) {
  const onChange = jest.fn();
  render(<DateRelativeWidget value={value} onChange={onChange} />);
  return { onChange };
}

describe("DateRelativeWidget", () => {
  it("should be able to set the value", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByText("Previous 7 days"));
    expect(onChange).toHaveBeenCalledWith("past7days");
  });

  it("should highlight the selected value", async () => {
    setup({ value: "past7days" });
    expect(
      screen.getByRole("button", { name: "Previous 7 days" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("should ignore invalid values", () => {
    setup({ value: "2024-10-20" });
    expect(screen.getByText("Today")).toBeInTheDocument();
  });
});

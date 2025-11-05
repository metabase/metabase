import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { DateMonthYearWidget } from "./DateMonthYearWidget";

type SetupOpts = {
  value?: string;
};

function setup({ value }: SetupOpts) {
  const onChange = jest.fn();
  render(<DateMonthYearWidget value={value} onChange={onChange} />);
  return { onChange };
}

describe("DateMonthYearWidget", () => {
  it("should be able to change a month", async () => {
    const { onChange } = setup({
      value: "2024-12",
    });

    await userEvent.click(screen.getByText("May"));

    expect(onChange).toHaveBeenCalledWith("2024-05");
  });

  it("should be able to change a year", async () => {
    const { onChange } = setup({
      value: "2024-12",
    });

    await userEvent.click(screen.getByText("2024"));
    await userEvent.click(screen.getByText("2025"));
    await userEvent.click(screen.getByText("Jan"));

    expect(onChange).toHaveBeenCalledWith("2025-01");
  });

  it("should ignore invalid values", () => {
    setup({
      value: "2024-10-20",
    });

    expect(screen.getByText("Jan")).toBeInTheDocument();
  });
});

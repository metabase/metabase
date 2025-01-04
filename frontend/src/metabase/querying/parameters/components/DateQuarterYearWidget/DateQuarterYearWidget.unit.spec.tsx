import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { DateQuarterYearWidget } from "./DateQuarterYearWidget";

type SetupOpts = {
  value?: string;
};

function setup({ value }: SetupOpts) {
  const onChange = jest.fn();
  render(<DateQuarterYearWidget value={value} onChange={onChange} />);
  return { onChange };
}

describe("DateQuarterYearWidget", () => {
  it("should be able to change a quarter", async () => {
    const { onChange } = setup({
      value: "Q1-2020",
    });

    await userEvent.click(screen.getByText("Q2"));

    expect(onChange).toHaveBeenCalledWith("Q2-2020");
  });

  it("should be able to change a year", async () => {
    const { onChange } = setup({
      value: "Q1-2020",
    });

    await userEvent.click(screen.getByText("2020"));
    await userEvent.click(screen.getByText("2024"));
    await userEvent.click(screen.getByText("Q3"));

    expect(onChange).toHaveBeenCalledWith("Q3-2024");
  });

  it("should ignore invalid values", () => {
    setup({
      value: "2024-10-20",
    });

    expect(screen.getByText("Q1")).toBeInTheDocument();
  });
});

import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { QuarterPicker } from "./QuarterPicker";

type SetupOpts = {
  value?: Date;
};

function setup({ value }: SetupOpts = {}) {
  const onChange = jest.fn();
  render(<QuarterPicker value={value} onChange={onChange} />);
  return { onChange };
}

describe("QuarterPicker", () => {
  it("should accept an empty value", () => {
    setup();
    expect(screen.getByText("Q1")).toBeInTheDocument();
  });

  it("should highlight the selected quarter", async () => {
    setup({
      value: new Date(2020, 3),
    });
    expect(screen.getByText("2020")).toBeInTheDocument();
    expect(screen.getByText("Q1")).not.toHaveAttribute("data-selected", "true");
    expect(screen.getByText("Q2")).toHaveAttribute("data-selected", "true");

    await userEvent.click(screen.getByText("2020"));
    await userEvent.click(screen.getByText("2024"));
    expect(screen.getByText("2024")).toBeInTheDocument();
    expect(screen.getByText("Q1")).not.toHaveAttribute("data-selected", "true");
    expect(screen.getByText("Q2")).not.toHaveAttribute("data-selected", "true");

    await userEvent.click(screen.getByText("2024"));
    await userEvent.click(screen.getByText("2020"));
    expect(screen.getByText("2020")).toBeInTheDocument();
    expect(screen.getByText("Q1")).not.toHaveAttribute("data-selected", "true");
    expect(screen.getByText("Q2")).toHaveAttribute("data-selected", "true");
  });

  it("should accept any dates within the quarter", () => {
    setup({
      value: new Date(2020, 5, 10, 20, 30),
    });
    expect(screen.getByText("2020")).toBeInTheDocument();
    expect(screen.getByText("Q1")).not.toHaveAttribute("data-selected", "true");
    expect(screen.getByText("Q2")).toHaveAttribute("data-selected", "true");
  });

  it("should be able to change a quarter", async () => {
    const { onChange } = setup({
      value: new Date(2020, 0),
    });

    await userEvent.click(screen.getByText("Q2"));

    expect(onChange).toHaveBeenCalledWith(new Date(2020, 3));
  });

  it("should be able to change a year", async () => {
    const { onChange } = setup({
      value: new Date(2020, 0),
    });

    await userEvent.click(screen.getByText("2020"));
    await userEvent.click(screen.getByText("2024"));
    await userEvent.click(screen.getByText("Q3"));

    expect(onChange).toHaveBeenCalledWith(new Date(2024, 6));
  });
});

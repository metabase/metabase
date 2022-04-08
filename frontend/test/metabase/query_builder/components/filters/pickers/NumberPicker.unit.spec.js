import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import NumberPicker from "metabase/query_builder/components/filters/pickers/NumberPicker";

describe("NumberPicker", () => {
  it("should display provided values", () => {
    const spy = jest.fn();
    render(<NumberPicker values={[16, 17]} onValuesChange={spy} />);
    screen.getByDisplayValue("16, 17");
  });

  it("should fire onValuesChange function on change", async () => {
    const spy = jest.fn();
    render(<NumberPicker values={[16, 17]} onValuesChange={spy} />);

    await fireEvent.change(
      screen.getByPlaceholderText("Enter desired number"),
      { target: { value: 18 } },
    );
    expect(spy).toHaveBeenCalledWith([18]);
  });

  it("should display error border on non-numeric values", async () => {
    const spy = jest.fn();
    const { container } = render(
      <NumberPicker values={["foo", "bar"]} onValuesChange={spy} />,
    );
    expect(container.querySelectorAll(".border-error")).toHaveLength(1);
  });

  it("should display prefix if prefix prop is populated", async () => {
    const spy = jest.fn();
    render(
      <NumberPicker values={[16, 17]} prefix="$$$" onValuesChange={spy} />,
    );

    expect(screen.getByTestId("input-prefix")).toHaveTextContent("$$$");
  });

  it("should not display prefix if prefix prop is not populated", async () => {
    const spy = jest.fn();
    render(<NumberPicker values={["foo", "bar"]} onValuesChange={spy} />);

    expect(screen.queryByTestId("input-prefix")).toBeNull();
  });
});

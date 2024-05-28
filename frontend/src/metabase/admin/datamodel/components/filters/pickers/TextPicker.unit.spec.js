import { render, screen, fireEvent } from "@testing-library/react";

import TextPicker from "./TextPicker";

describe("TextPicker", () => {
  it("should display provided values", () => {
    const spy = jest.fn();
    render(<TextPicker values={["foo", "bar"]} onValuesChange={spy} />);
    expect(screen.getByDisplayValue("foo, bar")).toBeInTheDocument();
  });

  it("should fire onValuesChange function on change", async () => {
    const spy = jest.fn();
    render(<TextPicker values={["foo", "bar"]} onValuesChange={spy} />);

    await fireEvent.change(screen.getByPlaceholderText("Enter desired text"), {
      target: { value: "baz" },
    });
    expect(spy).toHaveBeenCalledWith(["baz"]);
  });

  it("should display prefix if prefix prop is populated", async () => {
    const spy = jest.fn();
    render(
      <TextPicker values={["foo", "bar"]} prefix="$$$" onValuesChange={spy} />,
    );

    expect(screen.getByTestId("input-prefix")).toHaveTextContent("$$$");
  });

  it("should not display prefix if prefix prop is not populated", async () => {
    const spy = jest.fn();
    render(<TextPicker values={["foo", "bar"]} onValuesChange={spy} />);

    expect(screen.queryByTestId("input-prefix")).not.toBeInTheDocument();
  });
});

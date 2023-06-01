import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { color, colors } from "metabase/lib/colors/palette";
import ColorSettings from "./ColorSettings";

describe("ColorSettings", () => {
  const initialColors = {
    brand: color("success"),
    accent1: color("text-medium"),
  };

  it("should update brand colors", () => {
    const onChange = jest.fn();

    render(
      <ColorSettings
        initialColors={initialColors}
        originalColors={colors}
        onChange={onChange}
      />,
    );

    const input = screen.getByPlaceholderText(color("summarize"));
    userEvent.clear(input);
    userEvent.type(input, color("error"));

    expect(onChange).toHaveBeenLastCalledWith({
      brand: color("success"),
      summarize: color("error"),
      accent1: color("text-medium"),
    });
  });

  it("should update chart colors", () => {
    const onChange = jest.fn();

    render(
      <ColorSettings
        initialColors={initialColors}
        originalColors={colors}
        onChange={onChange}
      />,
    );

    const input = screen.getByDisplayValue(color("text-medium"));
    userEvent.clear(input);
    userEvent.type(input, color("text-light"));

    expect(onChange).toHaveBeenLastCalledWith({
      brand: color("success"),
      accent1: color("text-light"),
    });
  });

  it("should reset chart colors", () => {
    const onChange = jest.fn();

    render(
      <ColorSettings
        initialColors={initialColors}
        originalColors={colors}
        onChange={onChange}
      />,
    );

    userEvent.click(screen.getByText("Reset to default colors"));
    userEvent.click(screen.getByText("Reset"));

    expect(onChange).toHaveBeenLastCalledWith({
      brand: color("success"),
    });
  });

  it("should generate chart colors", () => {
    const onChange = jest.fn();

    render(
      <ColorSettings
        initialColors={initialColors}
        originalColors={colors}
        onChange={onChange}
      />,
    );

    userEvent.click(screen.getByText("Generate chart colors"));

    expect(onChange).toHaveBeenLastCalledWith({
      brand: color("success"),
      accent0: expect.any(String),
      accent1: color("text-medium"),
      accent2: expect.any(String),
      accent3: expect.any(String),
      accent4: expect.any(String),
      accent5: expect.any(String),
      accent6: expect.any(String),
      accent7: expect.any(String),
    });
  });
});

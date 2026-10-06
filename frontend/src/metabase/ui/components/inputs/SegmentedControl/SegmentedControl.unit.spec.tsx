import userEvent from "@testing-library/user-event";

import { render, screen, within } from "__support__/ui";

import { Icon } from "../../icons";

import { SegmentedControl, type SegmentedControlItem } from "./index";

type Value = "code" | "preview";

interface SetupOpts {
  data: SegmentedControlItem<Value>[];
  value?: Value;
}

const setup = ({ data, value = "code" }: SetupOpts) => {
  const onChange = jest.fn();

  render(<SegmentedControl data={data} value={value} onChange={onChange} />);

  return { onChange };
};

describe("SegmentedControl", () => {
  it("should render text-only items", () => {
    setup({
      data: [
        { value: "code", label: "Code" },
        { value: "preview", label: "Preview" },
      ],
    });

    expect(screen.getByRole("radio", { name: "Code" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Preview" })).not.toBeChecked();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("should render a decorative icon next to the label", () => {
    setup({
      data: [
        { value: "code", label: "Code", icon: "embed" },
        { value: "preview", label: "Preview", icon: "eye_filled" },
      ],
    });

    const label = screen.getByText("Code");
    const icon = within(label).getByRole("img", { hidden: true });

    expect(icon).toHaveClass("Icon-embed");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("width", "12");
    expect(screen.getByRole("radio", { name: "Code" })).toBeInTheDocument();
  });

  it("should name icon-only items by their ariaLabel", () => {
    setup({
      data: [
        { value: "code", ariaLabel: "Code", icon: "embed" },
        { value: "preview", ariaLabel: "Preview", icon: "eye_filled" },
      ],
    });

    const icon = screen.getByRole("img", { name: "Code" });

    expect(icon).toHaveClass("Icon-embed");
    expect(icon).toHaveAttribute("width", "16");
    expect(screen.getByRole("radio", { name: "Code" })).toBeInTheDocument();
    expect(screen.queryByText("Code")).not.toBeInTheDocument();
  });

  it("should name icon-only items with a custom icon element by their ariaLabel", () => {
    setup({
      data: [
        {
          value: "code",
          ariaLabel: "Code",
          icon: <Icon name="embed" data-testid="custom-icon" />,
        },
        { value: "preview", ariaLabel: "Preview", icon: "eye_filled" },
      ],
    });

    expect(
      within(screen.getByLabelText("Code")).getByTestId("custom-icon"),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Code" })).toBeInTheDocument();
  });

  it("should render a custom icon element next to the label", () => {
    setup({
      data: [
        {
          value: "code",
          label: "Code",
          icon: <Icon name="embed" data-testid="custom-icon" />,
        },
        { value: "preview", label: "Preview" },
      ],
    });

    expect(
      within(screen.getByText("Code")).getByTestId("custom-icon"),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Code" })).toBeInTheDocument();
  });

  it("should call onChange with the value of the clicked item", async () => {
    const { onChange } = setup({
      data: [
        { value: "code", label: "Code" },
        { value: "preview", ariaLabel: "Preview", icon: "eye_filled" },
      ],
    });

    await userEvent.click(screen.getByLabelText("Preview"));
    await userEvent.click(screen.getByLabelText("Preview"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("preview");
  });

  it("should disable individual items", () => {
    setup({
      data: [
        { value: "code", label: "Code" },
        { value: "preview", label: "Preview", disabled: true },
      ],
    });

    expect(screen.getByRole("radio", { name: "Code" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Preview" })).toBeDisabled();
  });
});

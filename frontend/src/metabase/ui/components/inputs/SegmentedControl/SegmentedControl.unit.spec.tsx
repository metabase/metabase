import userEvent from "@testing-library/user-event";

import { act, render, screen, waitFor, within } from "__support__/ui";
import { isFocusVisible } from "metabase/utils/dom";

import { Icon } from "../../icons";

import { SegmentedControl, type SegmentedControlItem } from "./index";

jest.mock("metabase/utils/dom", () => ({
  ...jest.requireActual("metabase/utils/dom"),
  isFocusVisible: jest.fn(() => false),
}));

type Value = "code" | "preview";

interface SetupOpts {
  data: SegmentedControlItem<Value>[];
  value?: Value;
}

const TOOLTIP_DATA: SegmentedControlItem<Value>[] = [
  { value: "code", ariaLabel: "Code", icon: "embed", withTooltip: true },
  {
    value: "preview",
    ariaLabel: "Preview",
    icon: "eye_filled",
    withTooltip: true,
  },
];

// Mantine renders each segment as a radio input followed by its <label>.
const getSegment = (name: string) => {
  const radio = screen.getByRole("radio", { name });
  const label =
    radio instanceof HTMLInputElement ? radio.labels?.[0] : undefined;
  if (!label) {
    throw new Error(`No label for the "${name}" segment`);
  }
  return label;
};

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

    const segment = getSegment("Code");
    const icon = within(segment).getByRole("img", { hidden: true });

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

    expect(within(getSegment("Code")).getByTestId("custom-icon")).toBeVisible();
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

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("preview");
  });

  it("doesn't call onChange when clicking the selected item", async () => {
    const { onChange } = setup({
      value: "preview",
      data: [
        { value: "code", label: "Code" },
        { value: "preview", ariaLabel: "Preview", icon: "eye_filled" },
      ],
    });

    await userEvent.click(screen.getByLabelText("Preview"));

    expect(onChange).not.toHaveBeenCalled();
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

  describe("tooltips", () => {
    beforeEach(() => {
      jest.mocked(isFocusVisible).mockReturnValue(false);
    });

    it("should not show a tooltip for icon-only items without withTooltip", async () => {
      setup({
        data: [
          { value: "code", ariaLabel: "Code", icon: "embed" },
          { value: "preview", ariaLabel: "Preview", icon: "eye_filled" },
        ],
      });

      await userEvent.hover(screen.getByRole("img", { name: "Code" }));

      await expect(
        screen.findByRole("tooltip", {}, { timeout: 500 }),
      ).rejects.toThrow();
    });

    it("should show the ariaLabel as a tooltip on hover", async () => {
      setup({ data: TOOLTIP_DATA });

      await userEvent.hover(screen.getByRole("img", { name: "Preview" }));
      expect(
        await screen.findByRole("tooltip", { name: "Preview" }),
      ).toBeInTheDocument();

      await userEvent.unhover(screen.getByRole("img", { name: "Preview" }));
      await waitFor(() =>
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
      );
    });

    it("should show the tooltip for the keyboard-focused item and follow arrow keys", async () => {
      jest.mocked(isFocusVisible).mockReturnValue(true);
      setup({ data: TOOLTIP_DATA });

      await userEvent.tab();
      expect(
        await screen.findByRole("tooltip", { name: "Code" }),
      ).toBeInTheDocument();

      await userEvent.keyboard("{ArrowRight}");
      expect(
        await screen.findByRole("tooltip", { name: "Preview" }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.queryByRole("tooltip", { name: "Code" }),
        ).not.toBeInTheDocument(),
      );

      await userEvent.tab();
      await waitFor(() =>
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
      );
    });

    it("should not show the tooltip when focus doesn't come from the keyboard", async () => {
      setup({ data: TOOLTIP_DATA });

      act(() => screen.getByRole("radio", { name: "Preview" }).focus());

      // The tooltip mounts asynchronously, so wait to be sure it never shows.
      await expect(
        screen.findByRole("tooltip", {}, { timeout: 500 }),
      ).rejects.toThrow();
    });

    it("should keep the keyboard-focused tooltip after hovering another item", async () => {
      jest.mocked(isFocusVisible).mockReturnValue(true);
      setup({ data: TOOLTIP_DATA });

      await userEvent.tab();
      await screen.findByRole("tooltip", { name: "Code" });

      const previewIcon = screen.getByRole("img", { name: "Preview" });
      await userEvent.hover(previewIcon);
      await screen.findByRole("tooltip", { name: "Preview" });
      await userEvent.unhover(previewIcon);

      expect(
        await screen.findByRole("tooltip", { name: "Code" }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.queryByRole("tooltip", { name: "Preview" }),
        ).not.toBeInTheDocument(),
      );
    });

    it("should show the keyboard-focused tooltip over a hovered item", async () => {
      jest.mocked(isFocusVisible).mockReturnValue(true);
      setup({ data: TOOLTIP_DATA });

      await userEvent.hover(screen.getByRole("img", { name: "Code" }));
      await userEvent.tab();
      await screen.findByRole("tooltip", { name: "Code" });

      await userEvent.keyboard("{ArrowRight}");
      expect(
        await screen.findByRole("tooltip", { name: "Preview" }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.queryByRole("tooltip", { name: "Code" }),
        ).not.toBeInTheDocument(),
      );
    });

    it("should hide a hovered tooltip when keyboard focus moves to an item without one", async () => {
      jest.mocked(isFocusVisible).mockReturnValue(true);
      setup({
        data: [
          {
            value: "code",
            ariaLabel: "Code",
            icon: "embed",
            withTooltip: true,
          },
          { value: "preview", label: "Preview" },
        ],
        value: "preview",
      });

      await userEvent.hover(screen.getByRole("img", { name: "Code" }));
      await screen.findByRole("tooltip", { name: "Code" });

      await userEvent.tab();
      expect(screen.getByRole("radio", { name: "Preview" })).toHaveFocus();
      await waitFor(() =>
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
      );
    });

    it("should hide a hovered tooltip on Escape", async () => {
      setup({ data: TOOLTIP_DATA });

      await userEvent.click(screen.getByRole("radio", { name: "Preview" }));
      await userEvent.hover(screen.getByRole("img", { name: "Code" }));
      await screen.findByRole("tooltip", { name: "Code" });

      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
      );
    });

    it("should hide a keyboard-focused tooltip on Escape", async () => {
      jest.mocked(isFocusVisible).mockReturnValue(true);
      setup({ data: TOOLTIP_DATA });

      await userEvent.tab();
      await screen.findByRole("tooltip", { name: "Code" });

      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
      );
    });
  });

  describe("truncated labels", () => {
    const LONG_LABEL = "Only when the value is above the goal line";
    const SEGMENT_TEXT_WIDTH = 100;
    const CHARACTER_WIDTH = 7;

    let elementRectSpy: jest.SpyInstance;
    let rangeRectSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.mocked(isFocusVisible).mockReturnValue(false);
      // jsdom has no layout: give every label the same width, and its text a width that grows with its length.
      elementRectSpy = jest
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockReturnValue(new DOMRect(0, 0, SEGMENT_TEXT_WIDTH, 16));
      rangeRectSpy = jest
        .spyOn(Range.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Range) {
          const textLength = this.startContainer.textContent?.length ?? 0;
          return new DOMRect(0, 0, textLength * CHARACTER_WIDTH, 16);
        });
    });

    afterEach(() => {
      elementRectSpy.mockRestore();
      rangeRectSpy.mockRestore();
    });

    const LONG_LABEL_DATA: SegmentedControlItem<Value>[] = [
      { value: "code", label: "Code" },
      { value: "preview", label: LONG_LABEL, icon: "eye_filled" },
    ];

    it("should show the full label as a tooltip on hover only when it's truncated", async () => {
      setup({ data: LONG_LABEL_DATA });

      await userEvent.hover(screen.getByText("Code"));
      await expect(
        screen.findByRole("tooltip", {}, { timeout: 500 }),
      ).rejects.toThrow();

      await userEvent.hover(screen.getByText(LONG_LABEL));
      expect(
        await screen.findByRole("tooltip", { name: LONG_LABEL }),
      ).toBeInTheDocument();
    });

    it("should show the full label as a tooltip on keyboard focus only when it's truncated", async () => {
      jest.mocked(isFocusVisible).mockReturnValue(true);
      setup({ data: LONG_LABEL_DATA });

      await userEvent.tab();
      expect(screen.getByRole("radio", { name: "Code" })).toHaveFocus();
      await expect(
        screen.findByRole("tooltip", {}, { timeout: 500 }),
      ).rejects.toThrow();

      await userEvent.keyboard("{ArrowRight}");
      expect(screen.getByRole("radio", { name: LONG_LABEL })).toHaveFocus();
      expect(
        await screen.findByRole("tooltip", { name: LONG_LABEL }),
      ).toBeInTheDocument();
    });
  });
});

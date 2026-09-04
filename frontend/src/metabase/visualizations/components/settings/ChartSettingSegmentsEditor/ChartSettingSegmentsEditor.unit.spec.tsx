import userEvent from "@testing-library/user-event";

import { fireEvent, render, screen, within } from "__support__/ui";
import type { ChartSettingSegmentsEditorProps } from "metabase/viz-core";
import type { ScalarSegment } from "metabase-types/api";

import { ChartSettingSegmentsEditor } from "./ChartSettingSegmentsEditor";

const createMockSegment = (opts?: Partial<ScalarSegment>): ScalarSegment => {
  return { label: "", min: 0, max: 100, color: "red", ...opts };
};

const DEFAULT_VALUE = [
  createMockSegment({ label: "bad" }),
  createMockSegment({ label: "good", min: 100, max: 200, color: "green" }),
];

const setup = (props: Partial<ChartSettingSegmentsEditorProps> = {}) => {
  const onChange = jest.fn();
  render(
    <ChartSettingSegmentsEditor
      value={DEFAULT_VALUE}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange };
};

it("Should render a segment editor", () => {
  setup();

  // Add a row for the header
  expect(screen.getAllByRole("row")).toHaveLength(3);

  // Unjustified type cast. FIXME
  const firstRow = screen.getAllByRole("row").at(1) as HTMLElement;

  expect(within(firstRow).getByPlaceholderText(/optional/)).toHaveValue("bad");
  expect(within(firstRow).getByPlaceholderText(/Min/)).toHaveValue("0");
  expect(within(firstRow).getByPlaceholderText(/Max/)).toHaveValue("100");
});

it("Should pass back a new array of segments on change", async () => {
  const { onChange } = setup();

  const min = await screen.findByDisplayValue("0");

  await userEvent.clear(min);
  await userEvent.type(min, "20");
  fireEvent.blur(min);

  expect(onChange).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ ...DEFAULT_VALUE[0], min: 20 }),
      // Need to use objectContaining here to account for the 'key' values that are added
      expect.objectContaining(DEFAULT_VALUE[1]),
    ]),
  );
});

it("Should allow you to remove a segment", async () => {
  const { onChange } = setup();

  await userEvent.click(
    // Unjustified type cast. FIXME
    (await screen.findAllByRole("img", { name: /trash/ })).at(0) as HTMLElement,
  );

  expect(onChange).toHaveBeenCalledWith([
    // Need to use objectContaining here to account for the 'key' values that are added
    expect.objectContaining(DEFAULT_VALUE[1]),
  ]);
});

it("Should not allow you to remove the last segment", async () => {
  setup({ value: [DEFAULT_VALUE[0]] });

  expect(await screen.findByDisplayValue("bad")).toBeInTheDocument();

  expect(screen.queryAllByRole("img", { name: /trash/ })).toHaveLength(0);
});

it("Should allow you to remove all segments if canRemoveAll is passed", async () => {
  const { onChange } = setup({ value: [DEFAULT_VALUE[0]], canRemoveAll: true });

  expect(await screen.findAllByRole("img", { name: /trash/ })).toHaveLength(1);

  await userEvent.click(
    // Unjustified type cast. FIXME
    (await screen.findAllByRole("img", { name: /trash/ })).at(0) as HTMLElement,
  );

  expect(onChange).toHaveBeenCalledWith([]);
});

it("Should allow you to add a new segment with appropriate defaults", async () => {
  const { onChange } = setup();

  await userEvent.click(
    await screen.findByRole("button", { name: /Add a range/ }),
  );

  expect(onChange).toHaveBeenCalledWith([
    // Need to use objectContaining here to account for the 'key' values that are added
    expect.objectContaining(DEFAULT_VALUE[0]),
    expect.objectContaining(DEFAULT_VALUE[1]),
    expect.objectContaining({
      min: 200,
      max: 400,
      color: expect.anything(),
    }),
  ]);
});

it("Should handle floating point values", async () => {
  const { onChange } = setup();

  const min = await screen.findByDisplayValue("0");

  await userEvent.clear(min);
  await userEvent.type(min, "12.5");
  fireEvent.blur(min);

  expect(onChange).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ ...DEFAULT_VALUE[0], min: 12.5 }),
      expect.objectContaining(DEFAULT_VALUE[1]),
    ]),
  );
});

it("Should not call onChange when blurring without changing value", async () => {
  const { onChange } = setup();

  const min = await screen.findByDisplayValue("0");

  fireEvent.focus(min);
  fireEvent.blur(min);

  expect(onChange).not.toHaveBeenCalled();
});

it("should show a placeholder if there are no segments", async () => {
  const { onChange } = setup({ value: [], canRemoveAll: true });

  expect(await screen.findByText(/Add color ranges/)).toBeInTheDocument();

  await userEvent.click(
    await screen.findByRole("button", { name: /Add a range/ }),
  );

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ min: 0, max: 1, color: expect.anything() }),
  ]);
});

it("Should not offer the same color twice in the picker (metabase#80823)", async () => {
  setup();

  // The trigger pill is labelled with the segment's own color, so "red" here
  // is the first segment's swatch rather than one of the palette options.
  await userEvent.click(screen.getByLabelText("red"));

  // Each swatch is labelled with the color it applies, so a duplicated color in
  // the palette shows up as two pills sharing an accessible name. Both then
  // render as selected when either is picked.
  const popover = await screen.findByRole("dialog");
  const colors = within(popover)
    .getAllByRole("button")
    .map((pill) => pill.getAttribute("aria-label"));

  expect(colors.length).toBeGreaterThan(0);
  expect(new Set(colors).size).toBe(colors.length);
});

import userEvent from "@testing-library/user-event";

import { fireEvent, render, screen, within } from "__support__/ui";
import type { ScalarSegment } from "metabase-types/api";

import {
  ChartSettingSegmentsEditor,
  type ChartSettingSegmentsEditorProps,
} from "./ChartSettingSegmentsEditor";

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

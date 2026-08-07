import userEvent from "@testing-library/user-event";

import { setupCardEndpoints } from "__support__/server-mocks";
import { fireEvent, render, renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type { DatasetData, GoalSegment, GoalValue } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import {
  ChartSettingSegmentsEditor,
  type ChartSettingSegmentsEditorProps,
} from "./ChartSettingSegmentsEditor";

const createMockSegment = (opts?: Partial<GoalSegment>): GoalSegment => {
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

describe("ChartSettingSegmentsEditor", () => {
  it("Should render a segment editor", () => {
    setup();

    expect(screen.getByPlaceholderText("Value 1")).toHaveValue("bad");
    expect(screen.getByPlaceholderText("Value 2")).toHaveValue("good");

    const minInputs = screen.getAllByPlaceholderText("Min");
    expect(minInputs[0]).toHaveValue("0");
    expect(minInputs[1]).toHaveValue("100");

    const maxInputs = screen.getAllByPlaceholderText("Max");
    expect(maxInputs[0]).toHaveValue("100");
    expect(maxInputs[1]).toHaveValue("200");
  });

  it("uses the goal-value widget for min/max", () => {
    renderWithProviders(
      <ChartSettingSegmentsEditor
        value={DEFAULT_VALUE}
        onChange={jest.fn()}
        data={createMockDatasetData({
          cols: [createMockColumn({ name: "count" })],
          rows: [[10]],
        })}
      />,
    );

    const inputsPerSegmentCount = 2;
    const segmentsCount = DEFAULT_VALUE.length;

    expect(
      screen.getAllByRole("button", { name: "Pick a dynamic value" }),
    ).toHaveLength(inputsPerSegmentCount * segmentsCount);
  });

  it("labels each range and its bounds distinctly", () => {
    setup();

    expect(screen.getByLabelText("Range 1 label")).toHaveValue("bad");
    expect(screen.getByLabelText("Range 1 minimum")).toHaveValue("0");
    expect(screen.getByLabelText("Range 2 maximum")).toHaveValue("200");
    expect(
      screen.getByRole("button", { name: "Remove range 2" }),
    ).toBeInTheDocument();
  });

  describe("bound errors", () => {
    const renderWithBound = (min: GoalValue | null, data: DatasetData) => {
      // GoalValueInput loads the referenced card to label the pill
      setupCardEndpoints(createMockCard({ id: 9, name: "Orders" }));

      return renderWithProviders(
        <ChartSettingSegmentsEditor
          value={[createMockSegment({ min })]}
          onChange={jest.fn()}
          data={data}
        />,
      );
    };

    const DATA = createMockDatasetData({
      cols: [createMockColumn({ name: "count", base_type: "type/Integer" })],
      rows: [[10]],
    });

    it("reports a column of this question that no longer exists", () => {
      renderWithBound("gone", DATA);

      expect(
        screen.getByText("This column no longer exists"),
      ).toBeInTheDocument();
    });

    it("reports a referenced query that failed without saying why", () => {
      renderWithBound(
        { type: "card", id: 9, column: "total" },
        createMockDatasetData({
          ...DATA,
          referenced_entities: { card: { 9: { status: "failed" } } },
        }),
      );

      expect(screen.getByText("Couldn't load this value")).toBeInTheDocument();
    });

    it("reports a referenced value that isn't a number", () => {
      renderWithBound(
        { type: "card", id: 9, column: "total" },
        createMockDatasetData({
          ...DATA,
          referenced_entities: {
            card: {
              9: {
                status: "completed",
                data: {
                  cols: [createMockColumn({ name: "total" })],
                  rows: [["nope"]],
                },
              },
            },
          },
        }),
      );

      expect(screen.getByText("This value isn't a number")).toBeInTheDocument();
    });

    it("surfaces the server's explanation for a referenced query that failed", () => {
      renderWithBound(
        { type: "card", id: 9, column: "total" },
        createMockDatasetData({
          ...DATA,
          referenced_entities: {
            card: {
              9: {
                status: "failed",
                error: "Referenced card 9 returned 3 rows",
              },
            },
          },
        }),
      );

      expect(
        screen.getByText("Referenced card 9 returned 3 rows"),
      ).toBeInTheDocument();
    });

    it("stays quiet while a reference is still resolving", () => {
      renderWithBound({ type: "card", id: 9, column: "total" }, DATA);

      expect(screen.queryByText(/Couldn't load/)).not.toBeInTheDocument();
      expect(screen.queryByText(/no longer exists/)).not.toBeInTheDocument();
    });

    it("reports a column of another question that no longer exists", () => {
      renderWithBound(
        { type: "card", id: 9, column: "avg" },
        createMockDatasetData({
          ...DATA,
          referenced_entities: {
            card: {
              9: {
                status: "completed",
                data: {
                  cols: [createMockColumn({ name: "total" })],
                  rows: [[250]],
                },
              },
            },
          },
        }),
      );

      expect(
        screen.getByText("This column no longer exists"),
      ).toBeInTheDocument();
    });
  });

  it("offers both value sources for a bound", async () => {
    renderWithProviders(
      <ChartSettingSegmentsEditor
        value={DEFAULT_VALUE}
        onChange={jest.fn()}
        data={createMockDatasetData({
          cols: [
            createMockColumn({ name: "count", base_type: "type/Integer" }),
          ],
          rows: [[10]],
        })}
      />,
    );

    expect(screen.getByLabelText("Range 1 minimum")).toHaveValue("0");

    await userEvent.click(
      screen.getAllByRole("button", { name: "Pick a dynamic value" })[0],
    );

    expect(
      await screen.findByRole("menuitem", { name: /Value from this question/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Value from another question/ }),
    ).toBeInTheDocument();
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
      checkNotNull(
        (await screen.findAllByRole("img", { name: /trash/ })).at(0),
      ),
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
    const { onChange } = setup({
      value: [DEFAULT_VALUE[0]],
      canRemoveAll: true,
    });

    expect(await screen.findAllByRole("img", { name: /trash/ })).toHaveLength(
      1,
    );

    await userEvent.click(
      checkNotNull(
        (await screen.findAllByRole("img", { name: /trash/ })).at(0),
      ),
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
});

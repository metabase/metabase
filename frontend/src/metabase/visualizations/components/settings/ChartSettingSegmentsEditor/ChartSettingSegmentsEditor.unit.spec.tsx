import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardDataset,
  setupCardEndpoints,
  setupMeasureEndpoint,
} from "__support__/server-mocks";
import { fireEvent, renderWithProviders, screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type {
  Card,
  DatasetData,
  GoalSegment,
  Measure,
  ReferencedEntityResult,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockMeasure,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";

import { ChartSettingSegmentsEditor } from "./ChartSettingSegmentsEditor";

const createMockSegment = (opts?: Partial<GoalSegment>): GoalSegment => {
  return { label: "", min: 0, max: 100, color: "red", ...opts };
};

const DEFAULT_VALUE = [
  createMockSegment({ label: "bad" }),
  createMockSegment({ label: "good", min: 100, max: 200, color: "green" }),
];

const CARD_ID = 9;
const MEASURE_ID = 4;
const DATASET_QUERY = createMockStructuredDatasetQuery();

type SetupOpts = {
  canRemoveAll?: boolean;
  card?: Card;
  data?: DatasetData;
  measure?: Measure;
  value?: GoalSegment[];
};

function setup({
  canRemoveAll,
  card = createMockCard({ id: CARD_ID, name: "Orders" }),
  data,
  measure = createMockMeasure({ id: MEASURE_ID, name: "Revenue" }),
  value = DEFAULT_VALUE,
}: SetupOpts = {}) {
  setupCardEndpoints(card);
  setupMeasureEndpoint(measure);

  const onChange = jest.fn();

  renderWithProviders(
    <ChartSettingSegmentsEditor
      canRemoveAll={canRemoveAll}
      data={data}
      datasetQuery={DATASET_QUERY}
      value={value}
      onChange={onChange}
    />,
  );

  return { onChange };
}

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
    setup({
      data: createMockDatasetData({
        cols: [createMockColumn({ name: "count" })],
        rows: [[10]],
      }),
    });

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
    const data = createMockDatasetData({
      cols: [createMockColumn({ name: "count", base_type: "type/Integer" })],
      rows: [[10]],
    });

    it("reports a column of this question that no longer exists", () => {
      setup({ value: [createMockSegment({ min: "gone" })], data: data });

      expect(
        screen.getByText("This column no longer exists"),
      ).toBeInTheDocument();
    });

    const references = [
      {
        type: "card",
        id: CARD_ID,
        createReferencedEntities: (result: ReferencedEntityResult) => ({
          card: { [CARD_ID]: result },
        }),
      },
      {
        type: "measure",
        id: MEASURE_ID,
        createReferencedEntities: (result: ReferencedEntityResult) => ({
          measure: { [MEASURE_ID]: result },
        }),
      },
    ] as const;

    describe.each(references)(
      "$type reference",
      ({ type, id, createReferencedEntities }) => {
        function setupReference(
          column: string,
          result: ReferencedEntityResult,
        ) {
          return setup({
            value: [createMockSegment({ min: { type, id, column } })],
            data: createMockDatasetData({
              ...data,
              referenced_entities: createReferencedEntities(result),
            }),
          });
        }

        it("reports a referenced query that failed without saying why", () => {
          setupReference("total", { status: "failed" });

          expect(
            screen.getByText("Couldn't load this value"),
          ).toBeInTheDocument();
        });

        it("reports a referenced value that isn't a number", () => {
          setupReference("total", {
            status: "completed",
            data: {
              cols: [createMockColumn({ name: "total" })],
              rows: [["nope"]],
            },
          });

          expect(
            screen.getByText("This value isn't a number"),
          ).toBeInTheDocument();
        });

        it("surfaces the server's explanation for a referenced query that failed", () => {
          setupReference("total", {
            status: "failed",
            error: "Referenced query returned 3 rows",
          });

          expect(
            screen.getByText("Referenced query returned 3 rows"),
          ).toBeInTheDocument();
        });

        it("resolves a reference the dataset can't answer by re-running the query with it attached", async () => {
          setupCardDataset({
            dataset: {
              data: createMockDatasetData({
                referenced_entities: createReferencedEntities({
                  status: "completed",
                  data: {
                    cols: [createMockColumn({ name: "total" })],
                    rows: [[999]],
                  },
                }),
              }),
            },
          });
          setup({
            value: [createMockSegment({ min: { type, id, column: "total" } })],
            data,
          });

          const pill = screen.getByRole("button", {
            name: "Change value source",
          });
          expect(await within(pill).findByText("999")).toBeInTheDocument();
          expect(screen.queryByText(/Couldn't load/)).not.toBeInTheDocument();
        });

        it("resolves a column the dataset predates from the fresh answer", async () => {
          setupCardDataset({
            dataset: {
              data: createMockDatasetData({
                referenced_entities: createReferencedEntities({
                  status: "completed",
                  data: {
                    cols: [
                      createMockColumn({ name: "total" }),
                      createMockColumn({ name: "avg" }),
                    ],
                    rows: [[250, 12]],
                  },
                }),
              }),
            },
          });
          setupReference("avg", {
            status: "completed",
            data: {
              cols: [createMockColumn({ name: "total" })],
              rows: [[250]],
            },
          });

          const pill = screen.getByRole("button", {
            name: "Change value source",
          });
          expect(await within(pill).findByText("12")).toBeInTheDocument();
          expect(
            screen.queryByText(/no longer exists/),
          ).not.toBeInTheDocument();
        });

        it("reports a referenced column that no longer exists", async () => {
          setupCardDataset({
            dataset: {
              data: createMockDatasetData({
                referenced_entities: createReferencedEntities({
                  status: "completed",
                  data: {
                    cols: [createMockColumn({ name: "total" })],
                    rows: [[250]],
                  },
                }),
              }),
            },
          });
          setup({
            value: [createMockSegment({ min: { type, id, column: "gone" } })],
            data,
          });

          expect(
            await screen.findByText("This column no longer exists"),
          ).toBeInTheDocument();
        });

        it("reports a failure instead of spinning forever when the resolving query fails", async () => {
          fetchMock.post("path:/api/dataset", 500);
          setup({
            value: [createMockSegment({ min: { type, id, column: "total" } })],
            data,
          });

          expect(
            await screen.findByText("Couldn't load this value"),
          ).toBeInTheDocument();
        });
      },
    );
  });

  it("collapses sibling bound requests into one query for all unanswered references", async () => {
    setupCardDataset({
      dataset: {
        data: createMockDatasetData({
          referenced_entities: {
            card: {
              [CARD_ID]: {
                status: "completed",
                data: {
                  cols: [createMockColumn({ name: "total" })],
                  rows: [[250]],
                },
              },
            },
            measure: {
              [MEASURE_ID]: {
                status: "completed",
                data: {
                  cols: [createMockColumn({ name: "revenue" })],
                  rows: [[999]],
                },
              },
            },
          },
        }),
      },
    });
    setup({
      value: [
        createMockSegment({
          min: { type: "card", id: CARD_ID, column: "total" },
          max: { type: "measure", id: MEASURE_ID, column: "revenue" },
        }),
      ],
      data: createMockDatasetData({
        cols: [createMockColumn({ name: "count", base_type: "type/Integer" })],
        rows: [[10]],
      }),
    });

    const pills = screen.getAllByRole("button", {
      name: "Change value source",
    });
    expect(await within(pills[0]).findByText("250")).toBeInTheDocument();
    expect(await within(pills[1]).findByText("999")).toBeInTheDocument();

    const calls = fetchMock.callHistory.calls("path:/api/dataset");
    expect(calls).toHaveLength(1);
    expect(await calls[0].request?.json()).toMatchObject({
      referenced_entities: [
        { type: "card", id: CARD_ID },
        { type: "measure", id: MEASURE_ID },
      ],
    });
  });

  it("offers both value sources for a bound", async () => {
    setup({
      data: createMockDatasetData({
        cols: [createMockColumn({ name: "count", base_type: "type/Integer" })],
        rows: [[10]],
      }),
    });

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

  it("clears the bound instead of committing NaN for a partial number", async () => {
    const { onChange } = setup();

    const min = await screen.findByDisplayValue("0");

    await userEvent.clear(min);
    await userEvent.type(min, "-");
    fireEvent.blur(min);

    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ ...DEFAULT_VALUE[0], min: null }),
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

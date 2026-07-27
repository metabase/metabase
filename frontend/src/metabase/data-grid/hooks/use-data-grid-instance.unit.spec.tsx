import { act, renderHook } from "@testing-library/react";

import { useDataGridInstance } from "./use-data-grid-instance";

const mockMeasure = jest.fn();

// Invariant checks related to metabase#78557: the effect that re-measures the
// grid on column sizing changes must measure once per value change and never
// for value-equal updates. The re-entrant render loop from the issue itself is
// not reproducible here (jsdom batches the notify-driven re-render), so the
// mock only makes measure() re-render like the real notify() does.
jest.mock("@tanstack/react-virtual", () => {
  const actual = jest.requireActual("@tanstack/react-virtual");
  const { useReducer } = jest.requireActual("react");

  return {
    ...actual,
    useVirtualizer: (options: unknown) => {
      const virtualizer = actual.useVirtualizer(options);
      const [, forceRender] = useReducer((count: number) => count + 1, 0);

      return Object.assign(virtualizer, {
        measure: () => {
          mockMeasure();
          forceRender();
        },
      });
    },
  };
});

type TestRow = { col1: string };

const DATA: TestRow[] = [{ col1: "value" }];
const COLUMNS_OPTIONS = [
  { id: "col1", name: "Col 1", accessorFn: (row: TestRow) => row.col1 },
];

const setup = () => {
  const { result } = renderHook(() =>
    useDataGridInstance<TestRow, string>({
      data: DATA,
      columnsOptions: COLUMNS_OPTIONS,
    }),
  );
  mockMeasure.mockClear();
  return result;
};

describe("useDataGridInstance measure-on-resize (metabase#78557)", () => {
  it("measures the grid a bounded number of times per column sizing change", () => {
    const result = setup();

    act(() => {
      result.current.table.setColumnSizing({ col1: 999 });
    });

    expect(mockMeasure).toHaveBeenCalledTimes(1);
  });

  it("does not measure when the sizing map changes identity but not value", () => {
    const result = setup();

    act(() => {
      result.current.table.setColumnSizing((prev) => ({ ...prev }));
    });

    expect(mockMeasure).not.toHaveBeenCalled();
  });
});

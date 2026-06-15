import { renderHook } from "@testing-library/react";

import { getSensibleVisualizations } from "metabase/visualizations/lib/sensibility";
import type Question from "metabase-lib/v1/Question";
import type { CardDisplayType, Dataset } from "metabase-types/api";

import { useChartTypes } from "./useChartTypes";

jest.mock("metabase/visualizations/lib/sensibility", () => ({
  getSensibleVisualizations: jest.fn(),
}));

const mockGetSensibleVisualizations = jest.mocked(getSensibleVisualizations);

const createQuestion = (display: CardDisplayType): Question => ({
  display: jest.fn(() => display),
  setDisplay: jest.fn(
    (nextDisplay: CardDisplayType): Question => createQuestion(nextDisplay),
  ),
  lockDisplay: jest.fn((q) => q),
});

const createQueryResult = (rowCount: number) =>
  ({
    data: { rows: Array.from({ length: rowCount }, () => []) },
  }) as unknown as Dataset;

type HookProps = {
  question: Question;
  queryResults: Dataset[] | null;
};

describe("useChartTypes", () => {
  beforeEach(() => {
    mockGetSensibleVisualizations.mockReturnValue({
      sensibleVisualizations: ["bar"],
      nonSensibleVisualizations: [],
    });
  });

  it("keeps the origin visualization after re-running questions", () => {
    const updateQuestion = jest.fn();
    const firstResult = createQueryResult(3);
    const rerunResult = createQueryResult(3);

    const initialProps: HookProps = {
      question: createQuestion("table"),
      queryResults: null,
    };

    const { result, rerender } = renderHook(
      ({ question, queryResults }: HookProps) =>
        useChartTypes(question, queryResults, updateQuestion),
      { initialProps },
    );

    rerender({ question: createQuestion("line"), queryResults: [firstResult] });

    expect(result.current.sensibleChartTypes.map(({ type }) => type)).toEqual([
      "line",
      "bar",
      "table",
    ]);

    rerender({
      question: createQuestion("table"),
      queryResults: [rerunResult],
    });

    expect(result.current.sensibleChartTypes.map(({ type }) => type)).toEqual([
      "line",
      "bar",
      "table",
    ]);
  });
});

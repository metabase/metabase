import { renderHook } from "@testing-library/react";

import { getSensibleVisualizations } from "metabase/visualizations/lib/sensibility";
import type Question from "metabase-lib/v1/Question";
import type { CardDisplayType, Dataset } from "metabase-types/api";

import { useMcpVisualizationSelector } from "./useMcpVisualizationSelector";

interface HookProps {
  question: Question;
  queryKey: string;
  queryResults: Dataset[] | null;
}

jest.mock("metabase/visualizations/lib/sensibility", () => ({
  getSensibleVisualizations: jest.fn(),
}));

const mockGetSensibleVisualizations = jest.mocked(getSensibleVisualizations);

const createQuestion = (display: CardDisplayType): Question =>
  ({
    display: jest.fn(() => display),
    setDisplay: jest.fn(
      (nextDisplay: CardDisplayType): Question => createQuestion(nextDisplay),
    ),
    lockDisplay: jest.fn(function (this: Question) {
      return this;
    }),
  }) as unknown as Question;

const createQueryResult = (rowCount: number) =>
  ({
    data: { rows: Array.from({ length: rowCount }, () => []) },
  }) as unknown as Dataset;

describe("useMcpVisualizationSelector", () => {
  beforeEach(() => {
    mockGetSensibleVisualizations.mockReturnValue({
      sensibleVisualizations: ["bar"],
      nonSensibleVisualizations: [],
    });
  });

  it("keeps the default visualization after re-running questions", () => {
    const updateQuestion = jest.fn();

    const firstResult = createQueryResult(3);
    const rerunResult = createQueryResult(3);
    const expected = ["line", "bar", "table"];

    const initialProps: HookProps = {
      question: createQuestion("table"),
      queryKey: "query-1",
      queryResults: null,
    };

    const { result, rerender } = renderHook(
      ({ question, queryKey, queryResults }: HookProps) =>
        useMcpVisualizationSelector({
          question,
          queryResults,
          updateQuestion,
          queryKey,
        }),
      { initialProps },
    );

    rerender({
      question: createQuestion("line"),
      queryKey: "query-1",
      queryResults: [firstResult],
    });

    expect(result.current.sensibleChartTypes.map(({ type }) => type)).toEqual(
      expected,
    );

    rerender({
      question: createQuestion("table"),
      queryKey: "query-1",
      queryResults: [rerunResult],
    });

    expect(result.current.sensibleChartTypes.map(({ type }) => type)).toEqual(
      expected,
    );
  });

  it("resets the default visualization for a new MCP query", () => {
    const updateQuestion = jest.fn();
    const firstResult = createQueryResult(3);
    const nextResult = createQueryResult(1);

    mockGetSensibleVisualizations.mockImplementation(({ result }) => ({
      sensibleVisualizations: result === nextResult ? ["scalar"] : ["bar"],
      nonSensibleVisualizations: [],
    }));

    const initialProps: HookProps = {
      question: createQuestion("line"),
      queryKey: "query-1",
      queryResults: [firstResult],
    };

    const { result, rerender } = renderHook(
      ({ question, queryKey, queryResults }: HookProps) =>
        useMcpVisualizationSelector({
          question,
          queryResults,
          updateQuestion,
          queryKey,
        }),
      { initialProps },
    );

    expect(result.current.sensibleChartTypes.map(({ type }) => type)).toEqual([
      "line",
      "bar",
      "table",
    ]);

    rerender({
      question: createQuestion("scalar"),
      queryKey: "query-2",
      queryResults: [nextResult],
    });

    expect(result.current.sensibleChartTypes.map(({ type }) => type)).toEqual([
      "scalar",
    ]);
  });

  it("waits for the new query result before capturing the default visualization", () => {
    const updateQuestion = jest.fn();
    const firstResult = createQueryResult(3);
    const nextResult = createQueryResult(1);

    mockGetSensibleVisualizations.mockImplementation(({ result }) => ({
      sensibleVisualizations: result === nextResult ? ["scalar"] : ["bar"],
      nonSensibleVisualizations: [],
    }));

    const initialProps: HookProps = {
      question: createQuestion("line"),
      queryKey: "query-1",
      queryResults: [firstResult],
    };

    const { result, rerender } = renderHook(
      ({ question, queryKey, queryResults }: HookProps) =>
        useMcpVisualizationSelector({
          question,
          queryResults,
          updateQuestion,
          queryKey,
        }),
      { initialProps },
    );

    expect(result.current.sensibleChartTypes.map(({ type }) => type)).toEqual([
      "line",
      "bar",
      "table",
    ]);

    rerender({
      question: createQuestion("line"),
      queryKey: "query-2",
      queryResults: [firstResult],
    });

    expect(result.current.sensibleChartTypes.map(({ type }) => type)).toEqual([
      "bar",
      "table",
    ]);

    rerender({
      question: createQuestion("line"),
      queryKey: "query-2",
      queryResults: [firstResult],
    });

    expect(result.current.sensibleChartTypes.map(({ type }) => type)).toEqual([
      "bar",
      "table",
    ]);

    rerender({
      question: createQuestion("scalar"),
      queryKey: "query-2",
      queryResults: [nextResult],
    });

    expect(result.current.sensibleChartTypes.map(({ type }) => type)).toEqual([
      "scalar",
    ]);
  });
});

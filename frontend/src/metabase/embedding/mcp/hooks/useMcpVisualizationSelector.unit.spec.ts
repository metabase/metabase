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
  // Unjustified type cast. FIXME
  ({
    display: jest.fn(() => display),
    setDisplay: jest.fn(
      (nextDisplay: CardDisplayType): Question => createQuestion(nextDisplay),
    ),
    lockDisplay: jest.fn(function (this: Question) {
      return this;
    }),
    displayIsLocked: jest.fn(() => false),
  }) as unknown as Question;

const createQueryResult = (rowCount: number) =>
  // Unjustified type cast. FIXME
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

  it("honors a requested display that arrives after the query settled", () => {
    // `requestedDisplay` is a prop: it can be null on the render where this
    // query's results land, and arrive on a later one. Marking the query
    // settled on that first pass means the request is never applied — the tool
    // asked for a chart type and silently got none.
    const updateQuestion = jest.fn();
    const question = createQuestion("table");
    const queryResults = [createQueryResult(3)];

    interface Props {
      requestedDisplay: CardDisplayType | null;
    }

    const initialProps: Props = { requestedDisplay: null };

    const { rerender } = renderHook(
      ({ requestedDisplay }: Props) =>
        useMcpVisualizationSelector({
          queryKey: "query-1",
          question,
          queryResults,
          updateQuestion,
          requestedDisplay,
        }),
      { initialProps },
    );

    expect(updateQuestion).not.toHaveBeenCalled();

    rerender({ requestedDisplay: "bar" });

    expect(updateQuestion).toHaveBeenCalledTimes(1);
    expect(question.setDisplay).toHaveBeenCalledWith("bar");
  });
});

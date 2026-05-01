import { renderHook } from "@testing-library/react";

import { useSelector } from "metabase/redux";
import type Question from "metabase-lib/v1/Question";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import type { ParameterValuesMap } from "metabase-types/api";

import type { SqlParameterValues } from "../../types";

import { useSdkControlledSqlParameters } from "./use-sdk-controlled-sql-parameters";

jest.mock("metabase/redux", () => ({
  useSelector: jest.fn(),
}));
jest.mock("metabase/selectors/metadata", () => ({
  getMetadata: jest.fn(),
}));
jest.mock("metabase-lib/v1/parameters/utils/cards", () => ({
  getCardUiParameters: jest.fn(),
}));

const useSelectorMock = useSelector as unknown as jest.Mock;
const getCardUiParametersMock = getCardUiParameters as unknown as jest.Mock;

const STATE_PARAM = {
  id: "p1",
  slug: "state",
  name: "State",
  type: "string/=",
  target: ["variable", ["template-tag", "state"]],
} as unknown as UiParameter;

const CITY_PARAM = {
  id: "p2",
  slug: "city",
  name: "City",
  type: "string/=",
  target: ["variable", ["template-tag", "city"]],
} as unknown as UiParameter;

const DEFAULT_DEFINITIONS: UiParameter[] = [STATE_PARAM, CITY_PARAM];

const makeQuestion = (id: number): Question =>
  ({
    id: () => id,
    card: () => ({}) as unknown,
    parameters: () => undefined,
  }) as unknown as Question;

type SetupOptions = {
  sqlParameters?: SqlParameterValues | null;
  onSqlParametersChange?: jest.Mock;
  question?: Question;
  parameterValues?: ParameterValuesMap;
  parameterDefinitions?: UiParameter[];
};

const setup = (options: SetupOptions = {}) => {
  const {
    sqlParameters,
    onSqlParametersChange,
    question = makeQuestion(1),
    parameterValues = {},
    parameterDefinitions = DEFAULT_DEFINITIONS,
  } = options;

  useSelectorMock.mockReturnValue({});
  getCardUiParametersMock.mockReturnValue(parameterDefinitions);

  const updateParameterValues = jest.fn();

  const utils = renderHook(
    (props: {
      sqlParameters: SqlParameterValues | null | undefined;
      onSqlParametersChange?: jest.Mock;
      question: Question | undefined;
      parameterValues: ParameterValuesMap;
    }) =>
      useSdkControlledSqlParameters({
        sqlParameters: props.sqlParameters,
        onSqlParametersChange: props.onSqlParametersChange,
        question: props.question,
        parameterValues: props.parameterValues,
        updateParameterValues,
      }),
    {
      initialProps: {
        sqlParameters,
        onSqlParametersChange,
        question,
        parameterValues,
      },
    },
  );

  return { updateParameterValues, ...utils };
};

describe("useSdkControlledSqlParameters", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("usePushControlled", () => {
    it.each([
      { value: undefined, label: "undefined" },
      { value: null, label: "null (JS-level guard for non-React hosts)" },
    ])("does not push when `sqlParameters` is $label", ({ value }) => {
      const { updateParameterValues } = setup({ sqlParameters: value });

      expect(updateParameterValues).not.toHaveBeenCalled();
    });

    it("pushes once `sqlParameters` and definitions are both ready", () => {
      const { updateParameterValues } = setup({
        sqlParameters: { state: "NY" },
        parameterValues: {},
      });

      expect(updateParameterValues).toHaveBeenCalledTimes(1);
      const next = updateParameterValues.mock.calls[0][0];
      // Full-replace: every defined parameter has an entry.
      expect(Object.keys(next)).toEqual(
        expect.arrayContaining([STATE_PARAM.id, CITY_PARAM.id]),
      );
    });

    it("does not re-push when applied state already matches the controlled push (avoids spurious manual-change after initial-state)", () => {
      const { updateParameterValues, rerender } = setup({
        sqlParameters: { state: "NY" },
        parameterValues: {},
      });

      expect(updateParameterValues).toHaveBeenCalledTimes(1);
      const firstNext = updateParameterValues.mock.calls[0][0];

      rerender({
        sqlParameters: { state: "NY" },
        onSqlParametersChange: undefined,
        question: makeQuestion(1),
        parameterValues: firstNext,
      });

      expect(updateParameterValues).toHaveBeenCalledTimes(1);
    });

    it("does not push when only the `question` ref changes but `sqlParameters` stays the same (`lastDispatchedRef` short-circuits)", () => {
      const stableSqlParameters = { state: "NY" };
      const { updateParameterValues, rerender } = setup({
        sqlParameters: stableSqlParameters,
        parameterValues: {},
      });

      expect(updateParameterValues).toHaveBeenCalledTimes(1);

      // New `Question` object with the same id (after mergeQuestionState)
      rerender({
        sqlParameters: stableSqlParameters,
        onSqlParametersChange: undefined,
        question: makeQuestion(1),
        parameterValues: {},
      });

      expect(updateParameterValues).toHaveBeenCalledTimes(1);
    });

    it("pushes once definitions arrive after an empty-defs mount (does not record `lastDispatchedRef` on the early-return skip)", () => {
      const stableSqlParameters = { state: "NY" };
      const { updateParameterValues, rerender } = setup({
        sqlParameters: stableSqlParameters,
        parameterDefinitions: [],
        parameterValues: {},
      });

      expect(updateParameterValues).not.toHaveBeenCalled();

      getCardUiParametersMock.mockReturnValue(DEFAULT_DEFINITIONS);
      rerender({
        sqlParameters: stableSqlParameters,
        onSqlParametersChange: undefined,
        question: makeQuestion(1),
        parameterValues: {},
      });

      expect(updateParameterValues).toHaveBeenCalledTimes(1);
    });
  });

  describe("useObserveAppliedSqlParameters", () => {
    it("emits `source: 'initial-state'` once on first sighting of a question", () => {
      const onSqlParametersChange = jest.fn();
      setup({
        sqlParameters: undefined,
        onSqlParametersChange,
        parameterValues: {},
      });

      expect(onSqlParametersChange).toHaveBeenCalledTimes(1);
      const payload = onSqlParametersChange.mock.calls[0][0];
      expect(payload.source).toEqual("initial-state");
      // Question payload spec omits `lastUsedParameters` entirely.
      expect(payload).not.toHaveProperty("lastUsedParameters");
      expect(payload).toHaveProperty("defaultParameters");
    });

    it("does not re-emit `initial-state` when the question reference changes but the id stays the same (`emittedQuestionIdRef` short-circuits)", () => {
      const onSqlParametersChange = jest.fn();
      const { rerender } = setup({
        sqlParameters: undefined,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: {},
      });

      expect(onSqlParametersChange).toHaveBeenCalledTimes(1);

      rerender({
        sqlParameters: undefined,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: {},
      });

      expect(onSqlParametersChange).toHaveBeenCalledTimes(1);
    });

    it("emits `source: 'initial-state'` again when the question id changes (navigateToNewCard) — `emittedQuestionIdRef` no longer matches", () => {
      const onSqlParametersChange = jest.fn();
      const { rerender } = setup({
        sqlParameters: undefined,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: {},
      });

      expect(onSqlParametersChange.mock.calls[0][0].source).toEqual(
        "initial-state",
      );

      rerender({
        sqlParameters: undefined,
        onSqlParametersChange,
        question: makeQuestion(2),
        parameterValues: {},
      });

      expect(onSqlParametersChange).toHaveBeenCalledTimes(2);
      expect(onSqlParametersChange.mock.calls[1][0].source).toEqual(
        "initial-state",
      );
    });

    it("emits `source: 'manual-change'` when applied values change after the initial load", () => {
      const onSqlParametersChange = jest.fn();
      const { rerender } = setup({
        sqlParameters: undefined,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: {},
      });

      expect(onSqlParametersChange.mock.calls[0][0].source).toEqual(
        "initial-state",
      );

      rerender({
        sqlParameters: undefined,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: { [STATE_PARAM.id]: ["NY"] },
      });

      expect(onSqlParametersChange).toHaveBeenCalledTimes(2);
      expect(onSqlParametersChange.mock.calls[1][0].source).toEqual(
        "manual-change",
      );
    });

    it("does not re-emit when applied values are deeply equal — `emittedValuesRef` deep-compare suppresses re-select-same-option", () => {
      const onSqlParametersChange = jest.fn();
      const initialValues: ParameterValuesMap = { [STATE_PARAM.id]: ["NY"] };
      const { rerender } = setup({
        sqlParameters: undefined,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: initialValues,
      });

      expect(onSqlParametersChange).toHaveBeenCalledTimes(1);

      // New `parameterValues` reference but same content.
      rerender({
        sqlParameters: undefined,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: { [STATE_PARAM.id]: ["NY"] },
      });

      expect(onSqlParametersChange).toHaveBeenCalledTimes(1);
    });

    it("uses `emittedValuesRef` (not the previous prop) for dedup — emit-skip-emit pattern across alternating values", () => {
      const onSqlParametersChange = jest.fn();
      const valuesA: ParameterValuesMap = { [STATE_PARAM.id]: ["NY"] };
      const valuesB: ParameterValuesMap = { [STATE_PARAM.id]: ["CA"] };

      const { rerender } = setup({
        sqlParameters: undefined,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: valuesA,
      });
      // initial-state for A.
      expect(onSqlParametersChange).toHaveBeenCalledTimes(1);

      // A => B: manual-change.
      rerender({
        sqlParameters: undefined,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: valuesB,
      });
      expect(onSqlParametersChange).toHaveBeenCalledTimes(2);
      expect(onSqlParametersChange.mock.calls[1][0].source).toEqual(
        "manual-change",
      );

      // B => B (fresh ref, same content): skip.
      rerender({
        sqlParameters: undefined,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: { [STATE_PARAM.id]: ["CA"] },
      });
      expect(onSqlParametersChange).toHaveBeenCalledTimes(2);

      // B => A: manual-change.
      rerender({
        sqlParameters: undefined,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: { [STATE_PARAM.id]: ["NY"] },
      });
      expect(onSqlParametersChange).toHaveBeenCalledTimes(3);
      expect(onSqlParametersChange.mock.calls[2][0].source).toEqual(
        "manual-change",
      );
    });

    it("does not fire `onSqlParametersChange` when pushed values are applied unchanged", () => {
      const onSqlParametersChange = jest.fn();
      const inputParameters = { state: ["NY"] };
      const { updateParameterValues, rerender } = setup({
        sqlParameters: undefined,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: {},
        parameterDefinitions: [STATE_PARAM],
      });

      expect(onSqlParametersChange).toHaveBeenCalledTimes(1);
      expect(onSqlParametersChange.mock.calls[0][0].source).toEqual(
        "initial-state",
      );

      getCardUiParametersMock.mockReturnValue([STATE_PARAM]);
      rerender({
        sqlParameters: inputParameters,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: {},
      });
      const pushed = updateParameterValues.mock.calls[0][0];

      rerender({
        sqlParameters: inputParameters,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: pushed,
      });

      expect(onSqlParametersChange).toHaveBeenCalledTimes(1);
    });

    it("emits `source: 'auto-change'` when pushed values are applied in a different shape (e.g. scalar normalized to array)", () => {
      const onSqlParametersChange = jest.fn();
      const { updateParameterValues, rerender } = setup({
        sqlParameters: undefined,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: {},
        parameterDefinitions: [STATE_PARAM],
      });
      expect(onSqlParametersChange).toHaveBeenCalledTimes(1);

      getCardUiParametersMock.mockReturnValue([STATE_PARAM]);
      rerender({
        sqlParameters: { state: "NY" },
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: {},
      });
      const pushed = updateParameterValues.mock.calls[0][0];

      rerender({
        sqlParameters: { state: "NY" },
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: pushed,
      });

      expect(onSqlParametersChange).toHaveBeenCalledTimes(2);
      const payload = onSqlParametersChange.mock.calls[1][0];
      expect(payload.source).toEqual("auto-change");
      expect(payload.parameters).toEqual({ state: ["NY"] });
    });

    it("emits `manual-change` for user edits after a host push", () => {
      const onSqlParametersChange = jest.fn();
      const inputParameters = { state: ["NY"] };
      const { updateParameterValues, rerender } = setup({
        sqlParameters: inputParameters,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: {},
        parameterDefinitions: [STATE_PARAM],
      });

      const pushed = updateParameterValues.mock.calls[0][0];

      rerender({
        sqlParameters: inputParameters,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: pushed,
      });
      expect(onSqlParametersChange).toHaveBeenCalledTimes(1);
      expect(onSqlParametersChange.mock.calls[0][0].source).toEqual(
        "initial-state",
      );

      // User edits a widget — different value than what the host pushed.
      rerender({
        sqlParameters: inputParameters,
        onSqlParametersChange,
        question: makeQuestion(1),
        parameterValues: { ...pushed, [STATE_PARAM.id]: ["CA"] },
      });
      expect(onSqlParametersChange).toHaveBeenCalledTimes(2);
      expect(onSqlParametersChange.mock.calls[1][0].source).toEqual(
        "manual-change",
      );
    });

    it("invokes the latest `onSqlParametersChange` ref even if the host swapped it after mount (callback ref isolation)", () => {
      const firstCallback = jest.fn();
      const secondCallback = jest.fn();

      const { rerender } = setup({
        sqlParameters: undefined,
        onSqlParametersChange: firstCallback,
        question: makeQuestion(1),
        parameterValues: {},
      });

      // initial-state goes to the first callback.
      expect(firstCallback).toHaveBeenCalledTimes(1);
      expect(secondCallback).not.toHaveBeenCalled();

      // Host swaps the callback ref + values change → manual-change
      // must fire on the *latest* callback, not the stale one.
      rerender({
        sqlParameters: undefined,
        onSqlParametersChange: secondCallback,
        question: makeQuestion(1),
        parameterValues: { [STATE_PARAM.id]: ["NY"] },
      });

      expect(firstCallback).toHaveBeenCalledTimes(1);
      expect(secondCallback).toHaveBeenCalledTimes(1);
      expect(secondCallback.mock.calls[0][0].source).toEqual("manual-change");
    });
  });
});

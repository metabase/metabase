import { renderHook } from "@testing-library/react";

import { useSdkDispatch, useSdkSelector } from "embedding-sdk-bundle/store";
import { startSdkListening } from "embedding-sdk-bundle/store/listener-middleware";
import {
  getParameterValues,
  getParameters,
} from "metabase/dashboard/selectors";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import { setParameterValues } from "metabase/redux/dashboard";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { ParameterValuesMap } from "metabase-types/api";

import { useSdkControlledParameters } from "./use-sdk-controlled-parameters";

jest.mock("embedding-sdk-bundle/store", () => ({
  useSdkDispatch: jest.fn(),
  useSdkSelector: jest.fn(),
}));
jest.mock("embedding-sdk-bundle/store/listener-middleware", () => ({
  startSdkListening: jest.fn(),
}));

const useSdkDispatchMock = useSdkDispatch as unknown as jest.Mock;
const useSdkSelectorMock = useSdkSelector as unknown as jest.Mock;
const startSdkListeningMock = startSdkListening as unknown as jest.Mock;

const STATE_PARAM = {
  id: "p1",
  slug: "state",
  name: "State",
  type: "string/=",
  target: ["variable", ["template-tag", "state"]],
} as unknown as UiParameter;

const CATEGORY_PARAM = {
  id: "p2",
  slug: "category",
  name: "Category",
  type: "string/=",
  target: ["variable", ["template-tag", "category"]],
} as unknown as UiParameter;

const DEFAULT_DEFINITIONS: UiParameter[] = [STATE_PARAM, CATEGORY_PARAM];

type RenderProps = {
  parameters: ParameterValues | null | undefined;
  onParametersChange: jest.Mock | undefined;
};

type SetupOptions = {
  parameters?: ParameterValues | null;
  onParametersChange?: jest.Mock;
  parameterDefinitions?: UiParameter[];
  appliedParameterValues?: ParameterValuesMap;
};

const setup = (options: SetupOptions = {}) => {
  const {
    parameters,
    onParametersChange,
    parameterDefinitions = [],
    appliedParameterValues = {},
  } = options;

  const dispatch = jest.fn();
  useSdkDispatchMock.mockReturnValue(dispatch);

  const selectorState = { parameterDefinitions, appliedParameterValues };
  useSdkSelectorMock.mockImplementation((selector) => {
    if (selector === getParameters) {
      return selectorState.parameterDefinitions;
    }
    if (selector === getParameterValues) {
      return selectorState.appliedParameterValues;
    }
    return undefined;
  });

  const unsubInitial = jest.fn();
  const unsubManual = jest.fn();
  startSdkListeningMock
    .mockReturnValueOnce(unsubInitial)
    .mockReturnValueOnce(unsubManual);

  const utils = renderHook(
    (props: RenderProps) =>
      useSdkControlledParameters({
        parameters: props.parameters,
        onParametersChange: props.onParametersChange,
      }),
    { initialProps: { parameters, onParametersChange } as RenderProps },
  );

  const updateSelectors = (next: Partial<typeof selectorState>) => {
    Object.assign(selectorState, next);
  };

  return {
    dispatch,
    unsubInitial,
    unsubManual,
    updateSelectors,
    ...utils,
  };
};

describe("useSdkControlledParameters", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("usePushControlledParameters", () => {
    it.each([
      { value: undefined, label: "undefined" },
      { value: null, label: "null (JS-level guard for non-React hosts)" },
    ])("does not dispatch when `parameters` is $label", ({ value }) => {
      const { dispatch } = setup({ parameters: value });

      expect(dispatch).not.toHaveBeenCalled();
    });

    it("dispatches setParameterValues once `parameters` and definitions are both ready", () => {
      const { dispatch } = setup({
        parameters: { state: "NY" },
        parameterDefinitions: DEFAULT_DEFINITIONS,
        appliedParameterValues: {},
      });

      expect(dispatch).toHaveBeenCalledTimes(1);
      const action = dispatch.mock.calls[0][0];
      expect(action.type).toEqual(setParameterValues.toString());
      // Full-replace: every defined parameter has an entry.
      expect(Object.keys(action.payload)).toEqual(
        expect.arrayContaining([STATE_PARAM.id, CATEGORY_PARAM.id]),
      );
    });

    it("does not re-dispatch when applied state already matches the controlled push (avoids spurious manual-change after initial-state)", () => {
      const { dispatch, rerender, updateSelectors } = setup({
        parameters: { state: "NY" },
        parameterDefinitions: DEFAULT_DEFINITIONS,
        appliedParameterValues: {},
      });

      expect(dispatch).toHaveBeenCalledTimes(1);
      const firstAction = dispatch.mock.calls[0][0];

      // Simulate Redux applying the dispatched values.
      updateSelectors({ appliedParameterValues: firstAction.payload });

      rerender({ parameters: { state: "NY" }, onParametersChange: undefined });

      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it("dispatches a deferred initial push once definitions arrive (does not record `lastDispatchedRef` on the empty-defs skip)", () => {
      // Keep the same `parameters` reference across renders. If the
      // empty-defs early return mistakenly recorded the ref, the second
      // run would see `lastDispatchedRef.current === parameters` and
      // skip — this test would fail.
      const stableParameters = { state: "NY" };
      const { dispatch, rerender, updateSelectors } = setup({
        parameters: stableParameters,
        parameterDefinitions: [],
      });

      expect(dispatch).not.toHaveBeenCalled();

      updateSelectors({ parameterDefinitions: DEFAULT_DEFINITIONS });
      rerender({
        parameters: stableParameters,
        onParametersChange: undefined,
      });

      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it("does not re-dispatch when only `parameterDefinitions` ref changes but `parameters` stays the same", () => {
      const stableParameters = { state: "NY" };
      const { dispatch, rerender, updateSelectors } = setup({
        parameters: stableParameters,
        parameterDefinitions: DEFAULT_DEFINITIONS,
        appliedParameterValues: {},
      });

      expect(dispatch).toHaveBeenCalledTimes(1);

      updateSelectors({ parameterDefinitions: [...DEFAULT_DEFINITIONS] });
      rerender({
        parameters: stableParameters,
        onParametersChange: undefined,
      });

      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe("useObserveAppliedParameters", () => {
    it("subscribes two listeners (initial-state + manual-change) on mount regardless of whether a callback is provided", () => {
      setup({ onParametersChange: undefined });

      // Subscriptions are unconditional — fire-time presence check
      // decides whether to invoke the host callback. Lets a callback
      // wired up after mount still receive subsequent events.
      expect(startSdkListeningMock).toHaveBeenCalledTimes(2);
    });

    it("does not re-subscribe listeners when `onParametersChange` ref changes between renders (no missed-event window for inline callbacks)", () => {
      const initialCallback = jest.fn();
      const { rerender } = setup({ onParametersChange: initialCallback });

      expect(startSdkListeningMock).toHaveBeenCalledTimes(2);

      // Simulate a host re-render passing a fresh inline function.
      rerender({
        parameters: undefined,
        onParametersChange: jest.fn(),
      });

      // Still 2 — listeners persist across the callback ref change.
      expect(startSdkListeningMock).toHaveBeenCalledTimes(2);
    });
  });
});

import type { Store } from "@reduxjs/toolkit";
import { createHistory } from "history";
import { useRouterHistory } from "react-router";

import {
  getParameterById,
  getParameterValues,
} from "metabase/dashboard/selectors";
import { mainReducers } from "metabase/reducers-main";
import { getStore } from "metabase/store";
import type { ParameterValueOrArray, TemporalUnit } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import {
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
} from "metabase-types/store/mocks";

import {
  REMOVE_PARAMETER,
  removeParameter,
  setParameterTemporalUnits,
} from "./parameters";

function setup(initialState: State) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const browserHistory = useRouterHistory(createHistory)();
  return getStore(
    mainReducers,
    browserHistory,
    initialState,
  ) as unknown as Store<State, any>;
}

describe("setParameterTemporalUnits", () => {
  it.each<{
    title: string;
    value: ParameterValueOrArray | null;
    defaultValue: ParameterValueOrArray | null;
    temporalUnits: TemporalUnit[];
    expectedValue: ParameterValueOrArray | null;
    expectedDefaultValue: ParameterValueOrArray | null;
  }>([
    {
      title: "should set temporal units",
      value: null,
      defaultValue: null,
      temporalUnits: ["minute", "hour"],
      expectedValue: null,
      expectedDefaultValue: null,
    },
    {
      title: "should reset the default value if outside of the list",
      value: null,
      defaultValue: "quarter",
      temporalUnits: ["minute", "hour", "year"],
      expectedValue: null,
      expectedDefaultValue: null,
    },
    {
      title: "should not reset the default value if within the list",
      value: null,
      defaultValue: "year",
      temporalUnits: ["minute", "hour", "year"],
      expectedValue: null,
      expectedDefaultValue: "year",
    },
    {
      title: "should reset the value if outside of the list",
      value: "hour",
      defaultValue: null,
      temporalUnits: ["month", "year"],
      expectedValue: null,
      expectedDefaultValue: null,
    },
    {
      title: "should not reset the value if within the list",
      value: "year",
      defaultValue: null,
      temporalUnits: ["month", "year"],
      expectedValue: "year",
      expectedDefaultValue: null,
    },
    {
      title:
        "should reset both the value and the default value if outside of the list",
      value: "year",
      defaultValue: "month",
      temporalUnits: ["hour", "day"],
      expectedValue: null,
      expectedDefaultValue: null,
    },
    {
      title:
        "should reset the value to the default value if the value is outside of the list but the default value is not",
      value: "year",
      defaultValue: "month",
      temporalUnits: ["hour", "day", "month"],
      expectedValue: "month",
      expectedDefaultValue: "month",
    },
  ])(
    "$title",
    async ({
      value,
      defaultValue,
      temporalUnits,
      expectedValue,
      expectedDefaultValue,
    }) => {
      const parameterId = "abc";
      const store = setup(
        createMockState({
          dashboard: createMockDashboardState({
            dashboardId: 1,
            dashboards: {
              "1": createMockStoreDashboard({
                id: 1,
                parameters: [
                  createMockParameter({
                    id: parameterId,
                    default: defaultValue,
                  }),
                ],
              }),
            },
            parameterValues: {
              [parameterId]: value,
            },
          }),
        }),
      );

      await store.dispatch(
        setParameterTemporalUnits(parameterId, temporalUnits),
      );

      expect(getParameterById(store.getState(), parameterId)).toMatchObject({
        temporal_units: temporalUnits,
        default: expectedDefaultValue,
      });
      expect(getParameterValues(store.getState())).toMatchObject({
        [parameterId]: expectedValue,
      });
    },
  );
});

describe("removeParameter", () => {
  it("should return the `parameterId` as `payload.id` (metabase#33826)", async () => {
    const store = setup(
      createMockState({
        dashboard: createMockDashboardState({
          dashboardId: 1,
          dashboards: {
            "1": createMockStoreDashboard({
              id: 1,
              parameters: [
                createMockParameter({ id: "123" }),
                createMockParameter({ id: "456" }),
              ],
            }),
          },
          parameterValues: {
            "123": null,
            "456": null,
          },
        }),
      }),
    );

    const result = await store.dispatch(removeParameter("123"));
    expect(result).toEqual({
      type: REMOVE_PARAMETER,
      payload: { id: "123" },
    });
  });
});

import type { Store } from "@reduxjs/toolkit";

import { getStore } from "__support__/entities-store";
import { getParameters } from "metabase/dashboard/selectors";
import { mainReducers } from "metabase/reducers-main";
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
  setParameterIsMultiSelect,
} from "./parameters";

function setup({ routing, ...initialState }: State) {
  return getStore(mainReducers, initialState) as Store<State, any>;
}

describe("setParameterIsMultiSelect", () => {
  it.each([
    {
      isMultiSelect: false,
      currentDefault: ["A", "B"],
      expectedDefault: ["A"],
    },
    {
      isMultiSelect: false,
      currentDefault: [1, 2],
      expectedDefault: [1],
    },
    {
      isMultiSelect: true,
      currentDefault: ["A", "B"],
      expectedDefault: ["A", "B"],
    },
    {
      isMultiSelect: false,
      currentDefault: null,
      expectedDefault: null,
    },
    {
      isMultiSelect: false,
      currentDefault: "ABC",
      expectedDefault: "ABC",
    },
  ])(
    "should coerce the default parameter value when no longer multi-select",
    async ({ isMultiSelect, currentDefault, expectedDefault }) => {
      const store = setup(
        createMockState({
          dashboard: createMockDashboardState({
            dashboardId: 1,
            dashboards: {
              "1": createMockStoreDashboard({
                id: 1,
                parameters: [
                  createMockParameter({ id: "123", default: currentDefault }),
                ],
              }),
            },
          }),
        }),
      );
      await store.dispatch(setParameterIsMultiSelect("123", isMultiSelect));
      const [parameter] = getParameters(store.getState());
      expect(parameter.default).toEqual(expectedDefault);
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

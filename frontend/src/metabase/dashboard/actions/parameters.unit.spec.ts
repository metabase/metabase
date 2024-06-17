import type { Store } from "@reduxjs/toolkit";
import { createHistory } from "history";
import { useRouterHistory } from "react-router";

import { mainReducers } from "metabase/reducers-main";
import { getStore } from "metabase/store";
import { createMockParameter } from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import {
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
} from "metabase-types/store/mocks";

import { REMOVE_PARAMETER, removeParameter } from "./parameters";

function setup(initialState: State) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const browserHistory = useRouterHistory(createHistory)();
  return getStore(
    mainReducers,
    browserHistory,
    initialState,
  ) as unknown as Store<State, any>;
}

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

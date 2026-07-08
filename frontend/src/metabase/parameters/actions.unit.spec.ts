import fetchMock from "fetch-mock";

import type { DispatchFn } from "metabase/redux";
import type { GetState } from "metabase/redux/store";
import { stableStringify } from "metabase/utils/objects";
import type { ParameterValues } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

import {
  fetchCardParameterValues,
  fetchDashboardParameterValues,
} from "./actions";

const PARAMETER = createMockParameter({ id: "param-1", name: "Category" });

const CACHED: ParameterValues = {
  values: [["Doohickey"], ["Gadget"]],
  has_more_values: false,
};

const createGetState = (cache: Record<string, ParameterValues>): GetState =>
  (() => ({
    parameters: { parameterValuesCache: cache },
  })) as unknown as GetState;

const dispatch = jest.fn() as unknown as DispatchFn;

describe("parameters > actions", () => {
  // Regression guard for the parameter-value dropdowns: the request used as the
  // cache key (and sent to the overridden embed endpoints) must not carry a null
  // `entityIdentifier`, otherwise it pollutes the key and every lookup misses.
  describe("fetchDashboardParameterValues", () => {
    const DASHBOARD_ID = 42;

    it("hits the cache keyed by dashId/paramId when not embedding", async () => {
      const getState = createGetState({
        [stableStringify({ dashId: DASHBOARD_ID, paramId: PARAMETER.id })]:
          CACHED,
      });

      const result = await fetchDashboardParameterValues({
        dashboardId: DASHBOARD_ID,
        entityIdentifier: null,
        parameter: PARAMETER,
        parameters: [],
      })(dispatch, getState);

      expect(result).toEqual(CACHED);
      // A cache hit must not fall through to the network.
      expect(fetchMock.callHistory.calls()).toHaveLength(0);
    });

    it("includes entityIdentifier in the cache key when embedding", async () => {
      const getState = createGetState({
        [stableStringify({
          dashId: DASHBOARD_ID,
          entityIdentifier: "uuid-1",
          paramId: PARAMETER.id,
        })]: CACHED,
      });

      const result = await fetchDashboardParameterValues({
        dashboardId: DASHBOARD_ID,
        entityIdentifier: "uuid-1",
        parameter: PARAMETER,
        parameters: [],
      })(dispatch, getState);

      expect(result).toEqual(CACHED);
      expect(fetchMock.callHistory.calls()).toHaveLength(0);
    });
  });

  describe("fetchCardParameterValues", () => {
    const CARD_ID = 7;

    it("hits the cache keyed by cardId/paramId when not embedding", async () => {
      const getState = createGetState({
        [stableStringify({ cardId: CARD_ID, paramId: PARAMETER.id })]: CACHED,
      });

      const result = await fetchCardParameterValues({
        cardId: CARD_ID,
        entityIdentifier: null,
        parameter: PARAMETER,
      })(dispatch, getState);

      expect(result).toEqual(CACHED);
      expect(fetchMock.callHistory.calls()).toHaveLength(0);
    });

    it("includes entityIdentifier in the cache key when embedding", async () => {
      const getState = createGetState({
        [stableStringify({
          cardId: CARD_ID,
          entityIdentifier: "uuid-1",
          paramId: PARAMETER.id,
        })]: CACHED,
      });

      const result = await fetchCardParameterValues({
        cardId: CARD_ID,
        entityIdentifier: "uuid-1",
        parameter: PARAMETER,
      })(dispatch, getState);

      expect(result).toEqual(CACHED);
      expect(fetchMock.callHistory.calls()).toHaveLength(0);
    });
  });
});

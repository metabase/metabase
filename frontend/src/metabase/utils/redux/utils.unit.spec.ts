import { delay } from "__support__/utils";
import type { Dispatch, RequestState, State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockRequestsState } from "metabase/redux/store/mocks/requests";

import { fetchData, updateData } from "./utils";

describe("Metadata", () => {
  const getDefaultArgs = (
    overrides: {
      existingData?: string;
      newData?: string;
      requestState?: RequestState;
      requestStateLoading?: RequestState;
      requestStateLoaded?: RequestState;
      requestStateError?: RequestState;
      statePath?: string[];
      statePathFetch?: string[];
      statePathUpdate?: string[];
      requestStatePath?: string[];
      existingStatePath?: string[];
      getState?: () => State;
      dispatch?: Dispatch;
      getData?: () => Promise<unknown>;
      putData?: () => Promise<unknown>;
    } = {},
  ) => {
    const existingData = overrides.existingData ?? "data";
    const newData = overrides.newData ?? "new data";
    const requestState = overrides.requestState;
    const requestStateLoading = overrides.requestStateLoading ?? {
      loading: true,
      loaded: false,
      fetched: false,
      error: null,
      _isRequestState: true as const,
    };
    const requestStateLoaded = overrides.requestStateLoaded ?? {
      loading: false,
      loaded: true,
      fetched: true,
      error: null,
      _isRequestState: true as const,
    };
    const requestStateError = overrides.requestStateError ?? {
      loading: false,
      loaded: false,
      fetched: false,
      error: new Error("error"),
      _isRequestState: true as const,
    };
    const statePath = overrides.statePath ?? ["test", "path"];
    const statePathFetch =
      overrides.statePathFetch ?? statePath.concat("fetch");
    const statePathUpdate =
      overrides.statePathUpdate ?? statePath.concat("update");
    const requestStatePath = overrides.requestStatePath ?? [
      "entities",
      ...statePath,
    ];
    const existingStatePath = overrides.existingStatePath ?? statePath;
    const getState =
      overrides.getState ??
      (() => ({
        ...createMockState(),
        requests: createMockRequestsState({
          entities: {
            test: {
              path: requestState
                ? { fetch: requestState, update: requestState }
                : {},
            },
          },
        }),
        test: { path: existingData },
      }));
    const dispatch = overrides.dispatch ?? jest.fn();
    const getData = overrides.getData ?? (() => Promise.resolve(newData));
    const putData = overrides.putData ?? (() => Promise.resolve(newData));

    return {
      dispatch,
      getState,
      requestStatePath,
      existingStatePath,
      getData,
      putData,
      // passthrough args constants
      existingData,
      newData,
      requestState,
      requestStateLoading,
      requestStateLoaded,
      requestStateError,
      statePath,
      statePathFetch,
      statePathUpdate,
    };
  };

  const args = getDefaultArgs({});

  describe("fetchData()", () => {
    it("should return new data if request hasn't been made", async () => {
      const argsDefault = getDefaultArgs({});
      const data = await fetchData(argsDefault);
      await delay(10);

      expect(argsDefault.dispatch).toHaveBeenCalledTimes(3);

      expect(argsDefault.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "metabase/requests/SET_REQUEST_LOADING",
        }),
      );
      expect(argsDefault.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "metabase/requests/SET_REQUEST_PROMISE",
        }),
      );
      expect(argsDefault.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "metabase/requests/SET_REQUEST_LOADED",
        }),
      );

      expect(data).toEqual(args.newData);
    });

    it("should return existing data if request has been made", async () => {
      const argsLoading = getDefaultArgs({
        requestState: args.requestStateLoading,
      });
      const dataLoading = await fetchData(argsLoading);
      expect(argsLoading.dispatch).toHaveBeenCalledTimes(0);
      expect(dataLoading).toEqual(args.existingData);

      const argsLoaded = getDefaultArgs({
        requestState: args.requestStateLoaded,
      });
      const dataLoaded = await fetchData(argsLoaded);
      expect(argsLoaded.dispatch).toHaveBeenCalledTimes(0);
      expect(dataLoaded).toEqual(args.existingData);
    });

    it("should return new data if previous request ended in error", async () => {
      const argsError = getDefaultArgs({
        requestState: args.requestStateError,
      });
      const dataError = await fetchData(argsError);
      await delay(10);

      expect(argsError.dispatch).toHaveBeenCalledTimes(3);

      expect(argsError.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "metabase/requests/SET_REQUEST_LOADING",
        }),
      );
      expect(argsError.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "metabase/requests/SET_REQUEST_PROMISE",
        }),
      );
      expect(argsError.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "metabase/requests/SET_REQUEST_LOADED",
        }),
      );

      expect(dataError).toEqual(args.newData);
    });

    // FIXME: this seems to make jasmine ignore the rest of the tests
    // is an exception bubbling up from fetchData? why?
    // how else to test return value in the catch case?
    it("should return existing data if request fails", async () => {
      const argsFail = getDefaultArgs({
        getData: () => Promise.reject("error"),
      });

      try {
        const dataFail = await fetchData(argsFail);
        expect(argsFail.dispatch).toHaveBeenCalledTimes(2);
        expect(dataFail).toEqual(args.existingData);
      } catch (error) {
        return;
      }
    });
  });

  describe("updateData()", () => {
    it("should return new data regardless of previous request state", async () => {
      const argsDefault = getDefaultArgs({});
      const data = await updateData(argsDefault);
      expect(argsDefault.dispatch).toHaveBeenCalledTimes(3);
      expect(data).toEqual(args.newData);

      const argsLoading = getDefaultArgs({
        requestState: args.requestStateLoading,
      });
      const dataLoading = await updateData(argsLoading);
      expect(argsLoading.dispatch).toHaveBeenCalledTimes(3);
      expect(dataLoading).toEqual(args.newData);

      const argsLoaded = getDefaultArgs({
        requestState: args.requestStateLoaded,
      });
      const dataLoaded = await updateData(argsLoaded);
      expect(argsLoaded.dispatch).toHaveBeenCalledTimes(3);
      expect(dataLoaded).toEqual(args.newData);

      const argsError = getDefaultArgs({
        requestState: args.requestStateError,
      });
      const dataError = await updateData(argsError);
      expect(argsError.dispatch).toHaveBeenCalledTimes(3);
      expect(dataError).toEqual(args.newData);
    });

    it("should return existing data if request fails", async () => {
      const argsFail = getDefaultArgs({
        putData: () => {
          throw new Error("test");
        },
      });
      const data = await updateData(argsFail);
      await delay(10);
      expect(argsFail.dispatch).toHaveBeenCalledTimes(2);
      expect(data).toEqual(args.existingData);
    });
  });
});

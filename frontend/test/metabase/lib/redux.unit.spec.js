import { fetchData, updateData } from "metabase/lib/redux";

import { delay } from "metabase/lib/promise";

describe("Metadata", () => {
  const getDefaultArgs = ({
    existingData = "data",
    newData = "new data",
    requestState = null,
    requestStateLoading = { loading: true },
    requestStateLoaded = { loaded: true },
    requestStateError = { error: new Error("error") },
    statePath = ["test", "path"],
    statePathFetch = statePath.concat("fetch"),
    statePathUpdate = statePath.concat("update"),
    requestStatePath = statePath,
    existingStatePath = statePath,
    getState = () => ({
      requests: {
        test: { path: { fetch: requestState, update: requestState } },
      },
      test: { path: existingData },
    }),
    dispatch = jasmine.createSpy("dispatch"),
    getData = () => Promise.resolve(newData),
    putData = () => Promise.resolve(newData),
  } = {}) => ({
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
  });

  const args = getDefaultArgs({});

  describe("fetchData()", () => {
    it("should return new data if request hasn't been made", async () => {
      const argsDefault = getDefaultArgs({});
      const data = await fetchData(argsDefault);
      await delay(10);
      expect(argsDefault.dispatch.calls.count()).toEqual(2);
      expect(data).toEqual(args.newData);
    });

    it("should return existing data if request has been made", async () => {
      const argsLoading = getDefaultArgs({
        requestState: args.requestStateLoading,
      });
      const dataLoading = await fetchData(argsLoading);
      expect(argsLoading.dispatch.calls.count()).toEqual(0);
      expect(dataLoading).toEqual(args.existingData);

      const argsLoaded = getDefaultArgs({
        requestState: args.requestStateLoaded,
      });
      const dataLoaded = await fetchData(argsLoaded);
      expect(argsLoaded.dispatch.calls.count()).toEqual(0);
      expect(dataLoaded).toEqual(args.existingData);
    });

    it("should return new data if previous request ended in error", async () => {
      const argsError = getDefaultArgs({
        requestState: args.requestStateError,
      });
      const dataError = await fetchData(argsError);
      await delay(10);
      expect(argsError.dispatch.calls.count()).toEqual(2);
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
        const dataFail = await fetchData(argsFail).catch(error =>
          console.log(error),
        );
        expect(argsFail.dispatch.calls.count()).toEqual(2);
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
      expect(argsDefault.dispatch.calls.count()).toEqual(2);
      expect(data).toEqual(args.newData);

      const argsLoading = getDefaultArgs({
        requestState: args.requestStateLoading,
      });
      const dataLoading = await updateData(argsLoading);
      expect(argsLoading.dispatch.calls.count()).toEqual(2);
      expect(dataLoading).toEqual(args.newData);

      const argsLoaded = getDefaultArgs({
        requestState: args.requestStateLoaded,
      });
      const dataLoaded = await updateData(argsLoaded);
      expect(argsLoaded.dispatch.calls.count()).toEqual(2);
      expect(dataLoaded).toEqual(args.newData);

      const argsError = getDefaultArgs({
        requestState: args.requestStateError,
      });
      const dataError = await updateData(argsError);
      expect(argsError.dispatch.calls.count()).toEqual(2);
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
      expect(argsFail.dispatch.calls.count()).toEqual(2);
      expect(data).toEqual(args.existingData);
    });
  });
});

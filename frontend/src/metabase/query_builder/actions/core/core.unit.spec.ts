import "metabase/api";

import * as runRtkEndpointModule from "metabase/api/utils/run-rtk-endpoint";

import * as querying from "../querying";

import { revertToRevision } from "./core";

describe("QB Actions > revertToRevision", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("re-runs the question query after reverting to a revision (metabase#45926)", async () => {
    // reverting only swaps out the card definition; without an explicit query
    // re-run the visualization keeps showing stale results until a manual
    // refresh. Guard that the thunk re-runs the query itself.
    jest
      .spyOn(runRtkEndpointModule, "runRtkEndpoint")
      .mockResolvedValue({ id: 1 });
    const runQuestionQuerySpy = jest.spyOn(querying, "runQuestionQuery");

    const dispatch = jest.fn();
    const getState = jest.fn();

    await revertToRevision(1, { id: 42 })(dispatch, getState);

    expect(runQuestionQuerySpy).toHaveBeenCalledTimes(1);
    expect(runQuestionQuerySpy).toHaveBeenCalledWith({
      shouldUpdateUrl: false,
    });
  });
});

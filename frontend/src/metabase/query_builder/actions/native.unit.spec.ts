import { cardApi } from "metabase/api";
import * as rtkEndpointUtils from "metabase/api/utils/run-rtk-endpoint";
import type { Card } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { queryBuilderReducer } from "../store/reducer";

import { openDataReferenceAtQuestion } from "./native";

type SetupOpts = {
  card: Card | undefined;
};

async function setup({ card }: SetupOpts) {
  const runRtkEndpointSpy = jest
    .spyOn(rtkEndpointUtils, "runRtkEndpoint")
    .mockResolvedValue(card);

  const action = await openDataReferenceAtQuestion(card?.id ?? 1)(
    jest.fn(),
    jest.fn(),
  );
  const initialState = queryBuilderReducer(undefined, { type: "@@INIT" });
  const state = queryBuilderReducer(initialState, action);

  return { runRtkEndpointSpy, initialState, state };
}

describe("openDataReferenceAtQuestion", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("opens the data reference at the referenced card", async () => {
    const card = createMockCard({ id: 10, database_id: 2 });
    const { runRtkEndpointSpy, initialState, state } = await setup({ card });

    expect(runRtkEndpointSpy).toHaveBeenCalledWith(
      { id: 10, ignore_error: true },
      expect.any(Function),
      cardApi.endpoints.getCard,
      { forceRefetch: false },
    );
    expect(initialState.uiControls.isShowingDataReference).toBe(false);
    expect(state.uiControls.isShowingDataReference).toBe(true);
    expect(state.uiControls.dataReferenceStack).toEqual([
      { type: "database", id: 2 },
      { type: "question", id: 10 },
    ]);
  });

  it("keeps the data reference closed when the card cannot be loaded", async () => {
    const { initialState, state } = await setup({ card: undefined });

    expect(state.uiControls).toEqual(initialState.uiControls);
  });
});

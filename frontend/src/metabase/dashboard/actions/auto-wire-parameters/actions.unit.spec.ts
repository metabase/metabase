import { getMainStore } from "__support__/entities-store";
import { performUndo } from "metabase/redux/undo";
import { createMockParameterMapping } from "metabase-types/api/mocks";

import { showAutoWireToast } from "./actions";
import {
  MATCHING_TARGET,
  PARAMETER_ID,
  createAutoWireState,
  createOrdersDashcard,
  getAutoConnectToasts,
} from "./tests/setup";
import { closeAutoWireParameterToast } from "./toasts";

describe("showAutoWireToast", () => {
  it("auto-wires an unmapped sibling card and preserves the selected mapping", async () => {
    const existingMapping = createMockParameterMapping({
      parameter_id: PARAMETER_ID,
      card_id: 2,
      target: MATCHING_TARGET,
    });
    const dashcard = createOrdersDashcard({
      seriesCardIds: [2],
      parameterMappings: [existingMapping],
    });
    const store = getMainStore(createAutoWireState([dashcard]));

    await store.dispatch(
      showAutoWireToast(PARAMETER_ID, dashcard.id, 2, MATCHING_TARGET, 1),
    );

    const autoWireToast = getAutoConnectToasts(store.getState())[0];
    expect(autoWireToast?.message).toContain("Created At");

    await store.dispatch(performUndo(autoWireToast!.id));

    expect(
      store.getState().dashboard.dashcards[dashcard.id].parameter_mappings,
    ).toEqual([
      existingMapping,
      {
        parameter_id: PARAMETER_ID,
        card_id: 1,
        target: MATCHING_TARGET,
      },
    ]);

    const undoToast = store
      .getState()
      .undo.find(({ type }) => type === "filterAutoConnectDone");
    await store.dispatch(performUndo(undoToast!.id));

    expect(
      store.getState().dashboard.dashcards[dashcard.id].parameter_mappings,
    ).toEqual([existingMapping]);
  });

  it("replaces an existing auto-wire offer toast", async () => {
    const dashcards = [1, 2, 3].map((id) =>
      createOrdersDashcard({ id, cardId: id }),
    );
    const store = getMainStore(createAutoWireState(dashcards));

    await store.dispatch(
      showAutoWireToast(
        PARAMETER_ID,
        dashcards[0].id,
        dashcards[0].card.id,
        MATCHING_TARGET,
        1,
      ),
    );
    expect(getAutoConnectToasts(store.getState())).toHaveLength(1);

    store.dispatch(closeAutoWireParameterToast());
    expect(getAutoConnectToasts(store.getState())).toHaveLength(0);

    await store.dispatch(
      showAutoWireToast(
        PARAMETER_ID,
        dashcards[1].id,
        dashcards[1].card.id,
        MATCHING_TARGET,
        1,
      ),
    );
    expect(getAutoConnectToasts(store.getState())).toHaveLength(1);
  });
});

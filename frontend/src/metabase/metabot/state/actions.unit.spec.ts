import { configureStore } from "@reduxjs/toolkit";

import {
  type MetabotAgentId,
  collapseConversation,
  createAgent,
  expandConversation,
  getNonExpandedChatAgentIds,
  getOverlayAgentId,
  getVisibleAgentId,
  metabotReducer,
} from "./index";

const setup = () => {
  const store = configureStore({ reducer: { metabot: metabotReducer } });
  const create = (agentId: MetabotAgentId) =>
    store.dispatch(createAgent({ agentId, visible: true }));
  // selectors read `state.metabot`, which this store provides
  const state = () => store.getState() as any;
  return { store, create, state };
};

describe("metabot expand/collapse thunks", () => {
  it("expandConversation overlays the agent and closes its pop-up", () => {
    const { store, create, state } = setup();
    create("chat_a");

    store.dispatch(expandConversation({ agentId: "chat_a" }));

    expect(getOverlayAgentId(state())).toBe("chat_a");
    expect(getVisibleAgentId(state())).toBeNull();
    // the overlaid agent drops out of the tab bar
    expect(getNonExpandedChatAgentIds(state())).toEqual([]);
  });

  it("expanding a second conversation collapses the first to a background tab", () => {
    const { store, create, state } = setup();
    create("chat_a");
    create("chat_b");

    store.dispatch(expandConversation({ agentId: "chat_a" }));
    store.dispatch(expandConversation({ agentId: "chat_b" }));

    expect(getOverlayAgentId(state())).toBe("chat_b");
    // chat_a is no longer overlaid nor visible — it's a background tab
    expect(getNonExpandedChatAgentIds(state())).toEqual(["chat_a"]);
    expect(getVisibleAgentId(state())).toBeNull();
  });

  it("collapseConversation clears the overlay and returns the agent to the pop-up", () => {
    const { store, create, state } = setup();
    create("chat_a");
    store.dispatch(expandConversation({ agentId: "chat_a" }));

    store.dispatch(collapseConversation({ agentId: "chat_a" }));

    expect(getOverlayAgentId(state())).toBeNull();
    expect(getVisibleAgentId(state())).toBe("chat_a");
    expect(getNonExpandedChatAgentIds(state())).toEqual(["chat_a"]);
  });
});

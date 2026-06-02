import { configureStore } from "@reduxjs/toolkit";

import {
  type MetabotAgentId,
  collapseConversation,
  createAgent,
  expandConversation,
  getBarChatAgentIds,
  getOverlayAgentId,
  getVisibleAgentId,
  metabotReducer,
  minimizeConversation,
} from "./index";

const setup = () => {
  const store = configureStore({ reducer: { metabot: metabotReducer } });
  const create = (agentId: MetabotAgentId) =>
    store.dispatch(createAgent({ agentId, visible: true, inBar: true }));
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
    expect(getBarChatAgentIds(state())).toEqual([]);
  });

  it("expanding a second conversation collapses the first to a background tab", () => {
    const { store, create, state } = setup();
    create("chat_a");
    create("chat_b");

    store.dispatch(expandConversation({ agentId: "chat_a" }));
    store.dispatch(expandConversation({ agentId: "chat_b" }));

    expect(getOverlayAgentId(state())).toBe("chat_b");
    // chat_a is no longer overlaid nor visible — it's a background tab
    expect(getBarChatAgentIds(state())).toEqual(["chat_a"]);
    expect(getVisibleAgentId(state())).toBeNull();
  });

  it("collapseConversation clears the overlay and returns the agent to the pop-up", () => {
    const { store, create, state } = setup();
    create("chat_a");
    store.dispatch(expandConversation({ agentId: "chat_a" }));

    store.dispatch(collapseConversation({ agentId: "chat_a" }));

    expect(getOverlayAgentId(state())).toBeNull();
    expect(getVisibleAgentId(state())).toBe("chat_a");
    expect(getBarChatAgentIds(state())).toEqual(["chat_a"]);
  });
});

describe("minimizeConversation thunk", () => {
  it("docks a full-page conversation into the bar as a visible pop-up", () => {
    const store = configureStore({ reducer: { metabot: metabotReducer } });
    const state = () => store.getState() as any;
    // a full-page conversation: exists but not in the bar
    store.dispatch(createAgent({ agentId: "chat_page", visible: false }));
    expect(getBarChatAgentIds(state())).toEqual([]);

    store.dispatch(minimizeConversation({ agentId: "chat_page" }));

    expect(getOverlayAgentId(state())).toBeNull();
    expect(getBarChatAgentIds(state())).toEqual(["chat_page"]);
    expect(getVisibleAgentId(state())).toBe("chat_page");
  });
});

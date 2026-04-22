import type { UseMetabotResult } from "embedding-sdk-bundle/types/metabot";

import { getWindow } from "./get-window";

type MetabotStateChannel = {
  value: UseMetabotResult | null;
  listeners: Set<() => void>;
};

// Collision note: like METABASE_EMBEDDING_SDK_BUNDLE, this global is
// single-version-per-page. Loading two SDK bundles on the same page
// clobbers the channel. Not a supported scenario.
const CHANNEL_KEY = "__MB_METABOT_STATE__";

const EMPTY_CHANNEL: MetabotStateChannel = {
  value: null,
  listeners: new Set(),
};

function getChannel(): MetabotStateChannel {
  const windowObject = getWindow();
  if (!windowObject) {
    return EMPTY_CHANNEL;
  }
  if (!windowObject[CHANNEL_KEY]) {
    windowObject[CHANNEL_KEY] = { value: null, listeners: new Set() };
  }
  return windowObject[CHANNEL_KEY];
}

export function publishMetabotState(value: UseMetabotResult | null): void {
  const channel = getChannel();
  channel.value = value;
  channel.listeners.forEach((listener) => listener());
}

export function subscribeMetabotState(listener: () => void): () => void {
  const channel = getChannel();
  channel.listeners.add(listener);
  return () => {
    channel.listeners.delete(listener);
  };
}

export function getMetabotStateSnapshot(): UseMetabotResult | null {
  return getChannel().value;
}

export type { MetabotStateChannel };

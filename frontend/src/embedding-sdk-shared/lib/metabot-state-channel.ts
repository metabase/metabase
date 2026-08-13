import { getWindow } from "./get-window";

// The payload is opaque here. The bundle publishes its `UseMetabotResult` and
// the package reads it back with the same type parameter; both sides compile
// against the same bundle version (see the collision note below).
type MetabotStateChannel = {
  value: unknown;
  listeners: Set<() => void>;
};

// Collision note: like METABASE_EMBEDDING_SDK_BUNDLE, this global is
// single-version-per-page. Loading two SDK bundles on the same page
// clobbers the state. Not a supported scenario.
const METABOT_STATE_KEY = "METABASE_EMBEDDING_SDK_METABOT_STATE";

const EMPTY_CHANNEL: MetabotStateChannel = {
  value: null,
  listeners: new Set(),
};

function getChannel(): MetabotStateChannel {
  const windowObject = getWindow();
  if (!windowObject) {
    return EMPTY_CHANNEL;
  }
  if (!windowObject[METABOT_STATE_KEY]) {
    windowObject[METABOT_STATE_KEY] = { value: null, listeners: new Set() };
  }
  return windowObject[METABOT_STATE_KEY];
}

export function publishMetabotState(value: unknown): void {
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

export function getMetabotStateSnapshot<TState>(): TState | null {
  // The channel stores the payload untyped so this module never imports the
  // bundle's types. The reader picks the type the publisher used.
  return getChannel().value as TState | null;
}

export type { MetabotStateChannel };

import { getWindow } from "./get-window";

// The payload is generic here so this module never imports the bundle's types.
// The bundle publishes its `UseMetabotResult` and the package reads it back
// with the same type parameter; both sides compile against the same bundle
// version (see the collision note below).
type MetabotStateChannel<TState = unknown> = {
  value: TState | null;
  listeners: Set<() => void>;
};

// Collision note: like METABASE_EMBEDDING_SDK_BUNDLE, this global is
// single-version-per-page. Loading two SDK bundles on the same page
// clobbers the state. Not a supported scenario.
const METABOT_STATE_KEY = "METABASE_EMBEDDING_SDK_METABOT_STATE";

const EMPTY_CHANNEL: MetabotStateChannel<never> = {
  value: null,
  listeners: new Set(),
};

function getChannel<TState>(): MetabotStateChannel<TState> {
  const windowObject = getWindow();
  if (!windowObject) {
    return EMPTY_CHANNEL;
  }
  if (!windowObject[METABOT_STATE_KEY]) {
    windowObject[METABOT_STATE_KEY] = { value: null, listeners: new Set() };
  }
  // The window holds one untyped singleton; the caller picks the state type,
  // and publisher and reader compile against the same bundle version.
  return windowObject[METABOT_STATE_KEY] as MetabotStateChannel<TState>;
}

export function publishMetabotState<TState>(value: TState | null): void {
  const channel = getChannel<TState>();
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
  return getChannel<TState>().value;
}

export type { MetabotStateChannel };

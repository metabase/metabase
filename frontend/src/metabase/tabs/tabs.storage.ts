import type { TabsState } from "./tabs.types";

const STORAGE_KEY = "metabase-tabs-v1";

export function loadPersistedTabsState(): TabsState | undefined {
  if (typeof localStorage === "undefined") {
    return undefined;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.ids) &&
      parsed.entities &&
      typeof parsed.entities === "object"
    ) {
      return {
        ids: parsed.ids,
        entities: parsed.entities,
        activeId:
          typeof parsed.activeId === "string" ? parsed.activeId : undefined,
      };
    }
  } catch {
    // ignore — corrupted storage falls back to a fresh state
  }
  return undefined;
}

export function persistTabsState(state: TabsState): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota errors etc. — silently skip
  }
}

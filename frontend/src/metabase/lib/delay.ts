declare global {
  interface Window {
    // Set REMOVE_DELAYS to true in environments where we want to remove them.
    // For example, in Storybook we want to remove delays to make Loki tests more
    // predictable.
    METABASE_REMOVE_DELAYS?: boolean;
  }
}

/**
 * Wrap any delay with this helper to make it skippable in
 * certain environments.
 */
export function delay(ms: number): number {
  if (typeof window !== "undefined" && window.METABASE_REMOVE_DELAYS) {
    return 0;
  }

  return ms;
}

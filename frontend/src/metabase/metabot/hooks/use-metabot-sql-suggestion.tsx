/**
 * Default (no-op) implementation of useMetabotSQLSuggestion.
 * The enterprise version provides actual SQL suggestion functionality.
 */
export function useMetabotSQLSuggestion(_bufferId: string) {
  return {
    source: undefined,
    isLoading: false,
    generate: async (_value: string) => {},
    error: undefined,
    cancelRequest: () => {},
    clear: () => {},
    reject: () => {},
    reset: () => {},
  };
}

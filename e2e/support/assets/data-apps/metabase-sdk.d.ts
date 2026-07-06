// Ambient types for the data-app E2E fixtures.
//
// The fixtures are standalone SDK apps built by Vite (types are stripped at
// build) and their behavior is enforced by the E2E run. We deliberately type the
// SDK surface loosely here rather than resolve the real types: the published
// `resources/embedding-sdk/dist` declarations can lag the branch, and resolving
// the SDK *source* drags in its internal module graph. This keeps the IDE quiet
// and matches what the host actually runs (top-level `{ tableId, databaseId }`).
//
// No top-level import/export — that would turn this into a module and the
// `declare module` blocks into augmentations. `import("react").ReactNode` is an
// inline type import, which keeps the file a global script.

declare module "@metabase/embedding-sdk-react" {
  export const InteractiveQuestion: (props: {
    questionId?: number | string;
    query?: unknown;
    card?: unknown;
  }) => import("react").ReactNode;
}

declare module "@metabase/embedding-sdk-react/data-app" {
  export type DataAppFactory = () => {
    component: () => import("react").ReactNode;
    providerProps?: unknown;
  };

  export function useMetabaseQuery(query: unknown): {
    data: { rawRows?: unknown[][] } | null;
    isLoading: boolean;
    error: unknown;
    refetch: () => Promise<void>;
  };

  export function useMetabaseQueryObject(query: unknown): unknown;
}

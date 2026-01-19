import { useParams as useParamsV7 } from "react-router-dom";

import { useRouter } from "metabase/router";

import { USE_V7_PARAMS } from "./config";

/**
 * Compatibility hook for accessing route params that works with both React Router v3 and v7.
 *
 * During migration:
 * - When USE_V7_PARAMS is false, uses the custom useRouter hook (v3)
 * - When USE_V7_PARAMS is true, uses react-router-dom v7 useParams
 *
 * Usage:
 * ```tsx
 * // For route "/dashboard/:slug"
 * const params = useCompatParams<{ slug: string }>();
 * console.log(params.slug);
 *
 * // Or with destructuring
 * const { slug } = useCompatParams<{ slug: string }>();
 * ```
 */
export function useCompatParams<
  T extends Record<string, string | undefined> = Record<
    string,
    string | undefined
  >,
>(): T {
  // Always call both hooks to satisfy rules of hooks
  const v7Params = useParamsV7();
  const { params: v3Params } = useRouter();

  if (USE_V7_PARAMS) {
    return v7Params as T;
  }

  return (v3Params || {}) as T;
}

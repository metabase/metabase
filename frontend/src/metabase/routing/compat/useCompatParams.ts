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
  if (USE_V7_PARAMS) {
    return useParamsV7() as T;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { params } = useRouter();
  return (params || {}) as T;
}

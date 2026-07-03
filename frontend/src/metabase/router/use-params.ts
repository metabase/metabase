import type { Params } from "./types";
import { useRouter } from "./use-router";

/**
 * react-router v7's `useParams`, implemented over the params injected by
 * react-router v3 into the router context. Values are URI-decoded like v7. The
 * one v3 difference is the splat param name (`params.splat`, not v7's
 * `params["*"]`), which resolves at the engine swap.
 *
 * @see https://reactrouter.com/7.18.1/api/hooks/useParams
 */
export function useParams<T extends Params = Params>(): T {
  return useRouter().params as T;
}

import type { Params } from "./types";
import { useRouter } from "./use-router";

/**
 * react-router v7's `useParams`, implemented over the params injected by
 * react-router v3 into the router context.
 */
export function useParams<T extends Params = Params>(): T {
  return useRouter().params as T;
}

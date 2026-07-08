import type { Params } from "./types";
import { useRouter } from "./use-router";

/**
 * react-router v7's `useParams`, implemented over the params injected by
 * react-router v3 into the router context. Values are URI-decoded like v7, and
 * the v3 splat param (`splat`) is exposed under v7's `*` key.
 *
 * @see https://reactrouter.com/7.18.1/api/hooks/useParams
 */
export function useParams<
  ParamsOrKey extends string | Record<string, string | undefined> = string,
>(): Readonly<
  [ParamsOrKey] extends [string] ? Params<ParamsOrKey> : Partial<ParamsOrKey>
> {
  type Result = Readonly<
    [ParamsOrKey] extends [string] ? Params<ParamsOrKey> : Partial<ParamsOrKey>
  >;
  const params = useRouter().params;

  if (!("splat" in params)) {
    return params as Result;
  }

  const { splat, ...rest } = params;
  const remapped: typeof params = { ...rest, "*": splat };
  return remapped as Result;
}

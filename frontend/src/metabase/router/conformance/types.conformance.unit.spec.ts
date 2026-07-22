import type { ComponentProps } from "react";
import type {
  Location as V7Location,
  NavigateFunction as V7NavigateFunction,
  NavigateOptions as V7NavigateOptions,
  NavigateProps as V7NavigateProps,
  OutletProps as V7OutletProps,
  Params as V7Params,
  Path as V7Path,
  SetURLSearchParams as V7SetURLSearchParams,
  To as V7To,
  URLSearchParamsInit as V7URLSearchParamsInit,
  useNavigate as v7UseNavigate,
  useParams as v7UseParams,
  useSearchParams as v7UseSearchParams,
} from "react-router-v7";

import type {
  Navigate,
  NavigateFunction,
  NavigateOptions,
  Outlet,
  Params,
  Path,
  SetURLSearchParams,
  To,
  URLSearchParamsInit,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "metabase/router";

/*
 * Compile-time conformance: these assertions fail `tsc` (not jest) if the
 * facade's public types drift from react-router v7's. Runtime behavior lives in
 * the sibling *.conformance specs; this file guards the type contract, the layer
 * a behavioral test cannot see (the missing `defaultInit` argument slipped
 * through exactly here).
 */

type Extends<A, B> = [A] extends [B] ? true : false;
type Equal<A, B> =
  Extends<A, B> extends true
    ? Extends<B, A> extends true
      ? true
      : false
    : false;
type Expect<T extends true> = T;

// The pure data types must be identical to v7's.
type _To = Expect<Equal<To, V7To>>;
type _Path = Expect<Equal<Path, V7Path>>;
type _Params = Expect<Equal<Params, V7Params>>;
type _Init = Expect<Equal<URLSearchParamsInit, V7URLSearchParamsInit>>;

// Hook signatures must match v7's, arguments included. This is the assertion
// that would have caught the missing `useSearchParams(defaultInit)` argument.
type _UseSearchParamsArgs = Expect<
  Equal<
    Parameters<typeof useSearchParams>,
    Parameters<typeof v7UseSearchParams>
  >
>;
type _UseNavigateArgs = Expect<
  Equal<Parameters<typeof useNavigate>, Parameters<typeof v7UseNavigate>>
>;
type _UseParamsReturn = Expect<
  Equal<ReturnType<typeof useParams>, ReturnType<typeof v7UseParams>>
>;

// The facade's location shape must match v7's. `state` is excluded on purpose:
// v7 types it `any`, the facade uses the safer `unknown` (the codebase bans
// `any`). Both are mutually assignable, so the swap is unaffected.
type _Location = Expect<
  Equal<
    Omit<ReturnType<typeof useLocation>, "state">,
    Omit<V7Location, "state">
  >
>;

// Where the facade omits v7 options it must be a strict subset (assignable to
// v7), so facade-typed code keeps compiling after the swap. The omitted options
// themselves are enumerated as known gaps below.
type _NavigateOptionsSubset = Expect<
  Extends<NavigateOptions, V7NavigateOptions>
>;
type _NavigateFnSubset = Expect<Extends<NavigateFunction, V7NavigateFunction>>;
type _SetSearchParamsSubset = Expect<
  Extends<SetURLSearchParams, V7SetURLSearchParams>
>;
type _NavigatePropsSubset = Expect<
  Extends<ComponentProps<typeof Navigate>, V7NavigateProps>
>;

/*
 * Coverage: every option/prop v7 exposes must be either implemented by the
 * facade or listed here as a deliberate gap. When a v7 upgrade adds a key, the
 * matching `Unaccounted` type stops being `never` and this file fails to
 * compile, forcing a conscious decision instead of a silent divergence.
 */

// Need the engine swap (relative resolution, scroll/transition control, URL
// masking, data-router revalidation), so intentionally unsupported on v3.
type KnownGapNavigateOptions =
  | "mask"
  | "preventScrollReset"
  | "relative"
  | "viewTransition"
  | "flushSync"
  | "defaultShouldRevalidate";
type UnaccountedNavigateOptions = Exclude<
  keyof V7NavigateOptions,
  keyof NavigateOptions | KnownGapNavigateOptions
>;
type _NavigateOptionsCovered = Expect<Equal<UnaccountedNavigateOptions, never>>;

type KnownGapNavigateProps = "relative";
type UnaccountedNavigateProps = Exclude<
  keyof V7NavigateProps,
  keyof ComponentProps<typeof Navigate> | KnownGapNavigateProps
>;
type _NavigatePropsCovered = Expect<Equal<UnaccountedNavigateProps, never>>;

// The facade's <Outlet> does not pass context down (no useOutletContext yet).
type KnownGapOutletProps = "context";
type UnaccountedOutletProps = Exclude<
  keyof V7OutletProps,
  keyof ComponentProps<typeof Outlet> | KnownGapOutletProps
>;
type _OutletPropsCovered = Expect<Equal<UnaccountedOutletProps, never>>;

describe("router type conformance", () => {
  it("is enforced by tsc, not at runtime", () => {
    expect(true).toBe(true);
  });
});

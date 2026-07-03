/**
 * The pathname, search, and hash values of a URL.
 *
 * @see https://api.reactrouter.com/v7/interfaces/react-router.Path.html
 */
export interface Path {
  pathname: string;
  search: string;
  hash: string;
}

/**
 * Describes a location that is the destination of some navigation, used in
 * Link, useNavigate, etc.
 *
 * @see https://api.reactrouter.com/v7/types/react-router.To.html
 */
export type To = string | Partial<Path>;

/**
 * An entry in a history stack. A location contains information about the URL
 * path, as well as possibly some arbitrary state and a key.
 *
 * @see https://api.reactrouter.com/v7/interfaces/react-router.Location.html
 */
export interface Location<State = unknown> {
  pathname: string;
  search: string;
  hash: string;
  state: State;
  key: string;
}

/**
 * Options for the `navigate` function, mirroring react-router v7's
 * `NavigateOptions`.
 *
 * @see https://api.reactrouter.com/v7/interfaces/react-router.NavigateOptions.html
 */
export interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
}

/**
 * The interface for the `navigate` function returned from `useNavigate`.
 *
 * @see https://api.reactrouter.com/v7/interfaces/react-router.NavigateFunction.html
 */
export interface NavigateFunction {
  (to: To, options?: NavigateOptions): void;
  (delta: number): void;
}

/**
 * The parameters that were parsed from the URL path.
 *
 * @see https://api.reactrouter.com/v7/types/react-router.Params.html
 */
export type Params<Key extends string = string> = {
  readonly [key in Key]: string | undefined;
};

/**
 * Accepted inputs for building search params, mirroring react-router v7's
 * `URLSearchParamsInit`.
 *
 * @see https://api.reactrouter.com/v7/types/react-router.URLSearchParamsInit.html
 */
export type URLSearchParamsInit =
  | string
  | URLSearchParams
  | [string, string][]
  | Record<string, string | string[]>;

/**
 * Sets new search params and causes a navigation when called.
 *
 * @see https://api.reactrouter.com/v7/types/react-router.SetURLSearchParams.html
 */
export type SetURLSearchParams = (
  nextInit?:
    | URLSearchParamsInit
    | ((prev: URLSearchParams) => URLSearchParamsInit),
  navigateOptions?: NavigateOptions,
) => void;

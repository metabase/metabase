/**
 * A partial path, mirroring react-router v7's `Path`.
 *
 * @see https://api.reactrouter.com/v7/interfaces/react-router.Path.html
 */
export interface Path {
  pathname: string;
  search: string;
  hash: string;
}

/**
 * A destination, mirroring react-router v7's `To`.
 *
 * @see https://api.reactrouter.com/v7/types/react-router.To.html
 */
export type To = string | Partial<Path>;

/**
 * A location, mirroring react-router v7's `Location`.
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
 * Navigation options, mirroring react-router v7's `NavigateOptions`.
 *
 * @see https://api.reactrouter.com/v7/interfaces/react-router.NavigateOptions.html
 */
export interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
}

/**
 * The function returned by `useNavigate`, mirroring react-router v7's
 * `NavigateFunction`.
 *
 * @see https://api.reactrouter.com/v7/interfaces/react-router.NavigateFunction.html
 */
export interface NavigateFunction {
  (to: To, options?: NavigateOptions): void;
  (delta: number): void;
}

/**
 * Parsed route params, mirroring react-router v7's `Params`.
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
  | string[][]
  | Record<string, string | string[]>;

/**
 * The setter returned by `useSearchParams`, mirroring react-router v7's
 * `SetURLSearchParams`.
 *
 * @see https://api.reactrouter.com/v7/types/react-router.SetURLSearchParams.html
 */
export type SetURLSearchParams = (
  nextInit?:
    | URLSearchParamsInit
    | ((prev: URLSearchParams) => URLSearchParamsInit),
  navigateOptions?: NavigateOptions,
) => void;

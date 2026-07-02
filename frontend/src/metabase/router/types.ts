export interface Path {
  pathname: string;
  search: string;
  hash: string;
}

/** A destination, mirroring react-router v7's `To`. */
export type To = string | Partial<Path>;

/** A location, mirroring react-router v7's `Location`. */
export interface Location<State = unknown> {
  pathname: string;
  search: string;
  hash: string;
  state: State;
  key: string;
}

export interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
}

export interface NavigateFunction {
  (to: To, options?: NavigateOptions): void;
  (delta: number): void;
}

export type Params<Key extends string = string> = {
  readonly [key in Key]: string | undefined;
};

export type URLSearchParamsInit =
  | string
  | URLSearchParams
  | string[][]
  | Record<string, string | string[]>;

export type SetURLSearchParams = (
  nextInit?:
    | URLSearchParamsInit
    | ((prev: URLSearchParams) => URLSearchParamsInit),
  navigateOptions?: NavigateOptions,
) => void;

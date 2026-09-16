import type { RequestMethod } from "./client/method";
import type { RequestOptions } from "./client/types";

type PathNames<Route extends string> =
  Route extends `${string}{${infer Name}}${infer Rest}`
    ? Name | PathNames<Rest>
    : never;

type RequestParts<Method extends RequestMethod, Route extends string> = {
  query?: Record<string, unknown> | null | void;
  body?: Method extends "GET" ? never : object | null;
} & ([PathNames<Route>] extends [never]
  ? { path?: never }
  : { path: Record<PathNames<Route>, string | number | boolean> });

/**
 * Declare the wire route once, separately from the argument-to-payload mapping.
 * The callable's apiContract exposes these same inferred types to tooling.
 * Serialization, authentication and embed middleware still belong to ApiClient.
 */
export function defineRequest<
  Argument,
  const Method extends RequestMethod,
  const Route extends `/api/${string}`,
  Parts extends RequestParts<Method, Route>,
>(definition: {
  method: Method;
  route: Route;
  request: (argument: Argument) => Parts;
  options?: Pick<RequestOptions, "headers" | "cache" | "noEvent">;
}) {
  const { method, route, request, options } = definition;
  if (
    /[?#:]/.test(route) ||
    route
      .split("/")
      .some((segment) =>
        /[{}]/.test(segment)
          ? !/^\{[\w-]+\}$/.test(segment)
          : [".", ".."].includes(segment),
      )
  ) {
    throw new Error(`Expected a route with whole {path} segments: ${route}`);
  }

  return Object.assign(
    (argument: Argument) => {
      const parts = request(argument);
      const url = route.replace(/\{([^}]+)\}/g, (_, name: PathNames<Route>) => {
        const value = parts.path?.[name];
        if (
          !["string", "number", "boolean"].includes(typeof value) ||
          value === "" ||
          value === "." ||
          value === ".."
        ) {
          throw new Error(`Invalid path parameter ${name} for ${route}`);
        }
        return encodeURIComponent(String(value));
      });
      return {
        ...options,
        method,
        url,
        params: parts.query,
        body: parts.body,
      };
    },
    { apiContract: Object.freeze({ method, route, request }) },
  );
}

import type { RequestMethod } from "./client/method";
import type { RequestOptions } from "./client/types";

type PathNames<Route extends string> =
  Route extends `${string}{${infer Name}}${infer Rest}`
    ? Name | PathNames<Rest>
    : never;

type RequestParts<Method extends RequestMethod, Route extends string> = {
  query?: Record<string, unknown> | null | void;
  body?: "GET" extends Method ? never : object | null;
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
    /[?#:\\%\s]/.test(route) ||
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

  const query = Object.assign(
    (argument: Argument) => {
      const parts = request(argument);
      if (method === "GET" && parts.body !== undefined) {
        throw new Error("Declare GET query parameters in query, not body");
      }
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
        headers: options?.headers,
        cache: options?.cache,
        noEvent: options?.noEvent,
        method,
        url,
        params: parts.query,
        body: parts.body,
      };
    },
    { apiContract: Object.freeze({ method, route, request }) },
  );
  // Tooling reads exactly the declaration used by this callable.
  Object.freeze(query);
  return query;
}

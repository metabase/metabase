import { type Ref, forwardRef } from "react";
import {
  Link as V7Link,
  type LinkProps as V7LinkProps,
  NavLink as V7NavLink,
  useInRouterContext,
} from "react-router-v7";

import { type RouterLinkProps, V3RouterLink } from "./react-router";
import { queryToSearch } from "./v7/location";

/**
 * The app's `<Link>`, engine-aware.
 *
 * v3's `<Link>` reads v3's legacy React context, which only a v3 `<Router>`
 * provides and which does not cross portals. On the v7 engine there is no v3
 * router, so a v3 `<Link>` throws "rendered outside of a router context" the
 * moment it is clicked (worst inside portaled modals). v7's `<Link>` uses modern
 * context, provided by the engine's `<BrowserRouter>` and propagated through
 * portals, so it works everywhere. Both collapse to v7's `<Link>` when the v3
 * engine is deleted in Phase 4.
 */

type V3To = RouterLinkProps["to"];

// v3 descriptors carry the query as a `query` object and `state` inline; v7 uses
// a `search` string and a separate `state` prop. Translate so existing call sites
// keep working on v7.
/**
 * v3 resolved a bare path against the root, so call sites write `to="reference"`
 * meaning `/reference`. v7 resolves it against the current route instead, which
 * would nest it (that link sits on `/browse/databases`). Anchor it so the target
 * does not depend on where the link is rendered.
 *
 * Left alone: a leading `?` or `#`, which keeps the current path by design, and
 * anything carrying a scheme (`https:`, `mailto:`) or a protocol-relative `//`,
 * which is not a route at all.
 */
function toRootRelative(pathname: string): string {
  const isAlreadyAnchored = pathname === "" || /^[/?#]/.test(pathname);
  const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(pathname);
  return isAlreadyAnchored || hasScheme ? pathname : `/${pathname}`;
}

function toV7Target(to: V3To): { to: V7LinkProps["to"]; state?: unknown } {
  if (to == null) {
    return { to: "" };
  }
  if (typeof to === "string") {
    return { to: toRootRelative(to) };
  }
  if (typeof to === "function") {
    // v3's function form of `to` has no v7 analog and is not used in the app.
    return { to: "" };
  }
  const { pathname, search, hash, query, state } = to;
  // `query` wins over `search`, matching history@3: call sites build
  // `{ ...location, query }`, where the spread carries a stale `search`.
  const searchString = query ? queryToSearch(query) : search;
  return {
    to: {
      pathname: pathname == null ? "" : toRootRelative(pathname),
      search: searchString,
      hash,
    },
    state,
  };
}

interface Props extends Omit<RouterLinkProps, "to"> {
  // Optional: a link with no destination is used as a button, navigating through
  // its own `onClick`.
  to?: V3To;
  // v3's ref-forwarding prop; the facade's `ForwardRefLink` still passes it.
  innerRef?: Ref<HTMLAnchorElement>;
}

export const RouterLink = forwardRef<HTMLAnchorElement, Props>(
  function RouterLink({ to, innerRef, ...props }, ref) {
    const linkRef = ref ?? innerRef;
    // Detect the engine from the mounted router rather than the flag, so the link
    // matches whichever provider actually wraps it (the flag and the provider
    // agree in the app; tests mount a provider directly).
    const isV7Engine = useInRouterContext();

    if (isV7Engine) {
      // v3-only props v7's `<Link>` does not accept.
      const { activeClassName, activeStyle, onlyActiveOnIndex, ...rest } =
        props;

      // A `<Link>` with no destination (`to` null or `""`) is used as a button: it
      // navigates through its `onClick`. v7's `<Link>` would additionally navigate
      // on click (an empty `to` resolves to the current route, or `/` from a
      // top-level portal like a toast), clobbering any push the handler performs,
      // so render a plain anchor instead. On v3 this matches `router.push("")` /
      // `router.push(undefined)`, which are no-ops, so only the handler runs.
      if (to == null || to === "") {
        return <a {...rest} ref={linkRef} />;
      }

      const { to: v7To, state } = toV7Target(to);

      // v3's `<Link>` highlights itself when its route is active via
      // `activeClassName`/`activeStyle` (and `onlyActiveOnIndex` for an exact
      // match). v7 moved that to `<NavLink>`, so route it there when a call site
      // asks for active styling; a plain `<Link>` would silently drop it.
      if (activeClassName != null || activeStyle != null) {
        const { className, style, ...navRest } = rest;
        return (
          <V7NavLink
            {...navRest}
            to={v7To}
            state={state}
            replace={false}
            ref={linkRef}
            end={onlyActiveOnIndex}
            className={({ isActive }) =>
              [className, isActive ? activeClassName : null]
                .filter(Boolean)
                .join(" ")
            }
            style={({ isActive }) =>
              isActive ? { ...style, ...activeStyle } : style
            }
          />
        );
      }

      // v7's `<Link>` silently downgrades a click to a `replace` when the target
      // equals the current URL. v3 always pushed, and call sites rely on it: the
      // "New document" menu item links to `/document/new` from `/document/new`,
      // and the unsaved-changes prompt keys off the new location. Push always.
      return (
        <V7Link
          {...rest}
          to={v7To}
          state={state}
          replace={false}
          ref={linkRef}
        />
      );
    }

    return (
      // `innerRef` is a valid v3 `<Link>` prop but is missing from its types.
      // @ts-expect-error see https://github.com/remix-run/react-router/blob/v3.2.6/docs/API.md#innerref
      <V3RouterLink {...props} to={to} innerRef={linkRef} />
    );
  },
);

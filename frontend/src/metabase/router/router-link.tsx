import { type Ref, forwardRef } from "react";
import {
  Link as V7Link,
  type LinkProps as V7LinkProps,
  useInRouterContext,
} from "react-router-v7";

import { type RouterLinkProps, V3RouterLink } from "./react-router";

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
function toV7Target(to: V3To): { to: V7LinkProps["to"]; state?: unknown } {
  if (to == null || typeof to === "string") {
    return { to: to ?? "" };
  }
  if (typeof to === "function") {
    // v3's function form of `to` has no v7 analog and is not used in the app.
    return { to: "" };
  }
  const { pathname, search, hash, query, state } = to;
  const searchString =
    search ?? (query ? `?${new URLSearchParams(query).toString()}` : undefined);
  return {
    to: { pathname: pathname ?? "", search: searchString, hash },
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

      // A `<Link>` with no destination is used as a button: it navigates through
      // its `onClick`. v7's `<Link>` would additionally navigate to the current
      // route on click, clobbering any push the handler performs, so render a
      // plain anchor instead. On v3 this matches `router.push(undefined)`, which
      // is a no-op, so only the handler runs.
      if (to == null) {
        return <a {...rest} ref={linkRef} />;
      }

      const { to: v7To, state } = toV7Target(to);
      return <V7Link {...rest} to={v7To} state={state} ref={linkRef} />;
    }

    return (
      // `innerRef` is a valid v3 `<Link>` prop but is missing from its types.
      // @ts-expect-error see https://github.com/remix-run/react-router/blob/v3.2.6/docs/API.md#innerref
      <V3RouterLink {...props} to={to} innerRef={linkRef} />
    );
  },
);

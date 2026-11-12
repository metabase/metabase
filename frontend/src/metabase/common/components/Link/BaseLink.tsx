import { useMergedRef } from "@mantine/hooks";
import {
  type CSSProperties,
  type HTMLProps,
  type Ref,
  forwardRef,
} from "react";

import {
  NavLink,
  type NavLinkProps,
  type NavLinkRenderProps,
  Link as RouterLink,
  type To,
  prefetchPage,
  useInRouterContext,
  usePrefetchOnVisible,
} from "metabase/router";

const INACTIVE: NavLinkRenderProps = {
  isActive: false,
  isPending: false,
  isTransitioning: false,
};

function resolveClassName(
  className: NavLinkProps["className"],
  state: NavLinkRenderProps,
): string | undefined {
  return typeof className === "function" ? className(state) : className;
}

function resolveStyle(
  style: NavLinkProps["style"],
  state: NavLinkRenderProps,
): CSSProperties | undefined {
  return typeof style === "function" ? style(state) : style;
}

function hrefFor(target: To): string {
  if (typeof target === "string") {
    return target;
  }
  return `${target.pathname ?? ""}${target.search ?? ""}${target.hash ?? ""}`;
}

/**
 * A bare path such as `to="reference"` means `/reference` throughout the app,
 * but react-router resolves it against the current route instead, which would
 * nest it. Anchor it so the target does not depend on where the link renders.
 *
 * Three forms are left alone:
 *
 * 1. A leading `?` or `#`, which keeps the current path by design.
 * 2. Anything carrying a scheme (`https:`, `mailto:`) or a protocol-relative
 *    `//`, which is not a route at all.
 * 3. An explicit `.` or `..`, which is route-relative on purpose. `..` means
 *    "up one level", so a page mounted under more than one route uses it to
 *    link back to whichever parent it currently sits under. Anchoring it would
 *    give `/..`, which react-router resolves to `/` — the link would go to the
 *    home page instead.
 */
function toRootRelative(pathname: string): string {
  const isAlreadyAnchored = pathname === "" || /^[/?#]/.test(pathname);
  const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(pathname);
  const isExplicitlyRelative = /^\.{1,2}(\/|$)/.test(pathname);
  return isAlreadyAnchored || hasScheme || isExplicitlyRelative
    ? pathname
    : `/${pathname}`;
}

function anchorTarget(to: To): To {
  if (typeof to === "string") {
    return toRootRelative(to);
  }
  return typeof to.pathname === "string"
    ? { ...to, pathname: toRootRelative(to.pathname) }
    : to;
}

export interface BaseLinkProps extends Omit<
  HTMLProps<any>,
  "className" | "style"
> {
  // Optional: a link with no destination is used as a button, navigating through
  // its own `onClick`.
  to?: To;
  /**
   * Pass a callback to style the link by whether its target is the active route.
   */
  className?: NavLinkProps["className"];
  /**
   * Pass a callback to style the link by whether its target is the active route.
   */
  style?: NavLinkProps["style"];
  // Match the target exactly rather than as a route prefix, for `isActive`.
  end?: boolean;
  // Mantine forwards a ref through this name; see `ForwardRefLink`.
  innerRef?: Ref<HTMLAnchorElement>;
}

/**
 * The app's unstyled router link. Renders react-router's `NavLink` when a call
 * site asks for active styling and its plain `Link` otherwise, so only the links
 * that need it subscribe to the current route.
 */
export const BaseLink = forwardRef<HTMLAnchorElement, BaseLinkProps>(
  function BaseLink(
    { to, innerRef, className, style, end, onMouseEnter, onFocus, ...rest },
    ref,
  ) {
    const forwardedRef = ref ?? innerRef;
    const inRouter = useInRouterContext();

    // A touch device never fires the hover below, so watch the link instead and
    // start the fetch when it comes into view. `usePrefetchOnVisible` decides
    // whether that applies; on a device with a pointer it does nothing.
    const hasTarget = to != null && to !== "";
    const visibleRef = usePrefetchOnVisible(
      inRouter && hasTarget ? hrefFor(anchorTarget(to)) : null,
    );
    const linkRef = useMergedRef(forwardedRef, visibleRef);

    // A link with no destination (`to` null or `""`) is used as a button: it
    // navigates through its `onClick`. A real `<Link>` would additionally
    // navigate on click (an empty `to` resolves to the current route, or `/`
    // from a top-level portal like a toast), clobbering any push the handler
    // performs, so render a plain anchor instead.
    //
    // `<Link>` also reads router context and throws without one. A component
    // rendered in isolation (common in unit tests) has no router, so fall back
    // to a plain anchor with the resolved href. The real app always mounts a
    // router, so that path never runs there.
    if (to == null || to === "" || to === "#" || !inRouter) {
      const href = to == null || to === "" ? undefined : hrefFor(to);
      return (
        <a
          {...rest}
          href={href}
          onMouseEnter={onMouseEnter}
          onFocus={onFocus}
          className={resolveClassName(className, INACTIVE)}
          style={resolveStyle(style, INACTIVE)}
          ref={linkRef}
        />
      );
    }

    const target = anchorTarget(to);

    // Reaching for a link is the earliest reliable sign that the user is about
    // to follow it, so a target in its own chunk starts loading here instead of
    // when its route renders. `prefetchPage` does nothing for a target that
    // registered no loader, which is almost all of them.
    const prefetchProps = {
      onMouseEnter: (event: React.MouseEvent<HTMLAnchorElement>) => {
        onMouseEnter?.(event);
        prefetchPage(hrefFor(target));
      },
      onFocus: (event: React.FocusEvent<HTMLAnchorElement>) => {
        onFocus?.(event);
        prefetchPage(hrefFor(target));
      },
    };

    if (typeof className === "function" || typeof style === "function") {
      return (
        <NavLink
          {...rest}
          {...prefetchProps}
          to={target}
          end={end}
          // Normalize both to callbacks: given a plain string `NavLink` appends
          // its own `active` class, which the app does not use.
          className={(state) => resolveClassName(className, state)}
          style={(state) => resolveStyle(style, state)}
          ref={linkRef}
        />
      );
    }

    return (
      <RouterLink
        {...rest}
        {...prefetchProps}
        to={target}
        className={className}
        style={style}
        ref={linkRef}
      />
    );
  },
);

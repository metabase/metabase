import cx from "classnames";
import { type ReactNode, createContext, useContext } from "react";

import { Box, type BoxProps } from "metabase/ui";

import S from "./PageBreadcrumbs.module.css";

/**
 * Breadcrumbs for the current page, provided by the app shell. Pages render
 * `PageBreadcrumbs` above their title; outside the main app nothing is provided.
 */
export const PageBreadcrumbsContext = createContext<ReactNode>(null);

/** Whether the app shell provides breadcrumbs, so pages can drop their own inline path. */
export function useHasPageBreadcrumbs(): boolean {
  return useContext(PageBreadcrumbsContext) != null;
}

/** Renders the app-provided breadcrumbs; collapses to nothing when there are none. */
export function PageBreadcrumbs({ className, ...props }: BoxProps) {
  const breadcrumbs = useContext(PageBreadcrumbsContext);

  if (breadcrumbs == null) {
    return null;
  }

  return (
    <Box
      className={cx(S.root, className)}
      data-testid="page-breadcrumbs"
      data-hide-on-print
      {...props}
    >
      {breadcrumbs}
    </Box>
  );
}

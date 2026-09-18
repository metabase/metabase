import type { ReactNode } from "react";

export interface DataAppRouterProps {
  children?: ReactNode;
}

/**
 * Wrap your data-app tree once. Inside, use `<DataAppLink to="…">` for
 * navigation and `useDataAppLocation()` to read the current path.
 *
 * No `basename` prop: it is auto-detected from the iframe URL
 * (`/embed/apps/<name>`). In the dev preview, where there is no prefix, the
 * basename resolves to `""` and the sub-path is just the raw pathname.
 */
export const DataAppRouter = ({ children }: DataAppRouterProps) => (
  <>{children}</>
);

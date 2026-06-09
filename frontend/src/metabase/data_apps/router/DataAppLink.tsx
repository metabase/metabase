import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";

import { getBasename } from "./DataAppRouter";

interface DataAppLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string;
  children?: ReactNode;
}

/**
 * Internal-only navigation link inside a data app.
 *
 * Renders react-router 3's `<Link>` under the hood — middle-click /
 * cmd-click / modifier-key handling and `<a href>` rendering all come
 * from v3's implementation. When MB upgrades to a newer router, this
 * file's `import { Link } from "react-router"` changes; the bundle's
 * `<DataAppLink to="…">` usage doesn't.
 *
 * The `to` prop is bundle-relative (e.g. `to="/customers/42"`); we add
 * the auto-detected basename before handing the URL to v3's `Link`.
 *
 * Must be rendered inside a `<DataAppRouter>` — v3's `<Link>` reads its
 * router from the surrounding `<Router>` (which `<DataAppRouter>` mounts)
 * and will throw without it.
 */
export const DataAppLink = ({ to, children, ...rest }: DataAppLinkProps) => (
  <Link to={getBasename() + to} {...rest}>
    {children}
  </Link>
);

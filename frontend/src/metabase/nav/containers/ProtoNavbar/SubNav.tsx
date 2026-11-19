import cx from "classnames";
import type { ReactNode } from "react";

import S from "./ProtoNavbar.module.css";

export function SubNavSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx(S.section, className)}>{children}</div>;
}

// Heading text is aligned with each nav item's icon glyph (the icon container
// sits ~0.25rem in from the section edge) instead of the default deeper indent.
export function SubNavHeading({ children }: { children: ReactNode }) {
  return <h4 className={S.subNavHeading}>{children}</h4>;
}

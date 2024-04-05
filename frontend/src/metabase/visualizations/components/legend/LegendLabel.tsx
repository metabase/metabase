import cx from "classnames";
import type { ReactNode } from "react";
import type { LinkProps } from "react-router";
import { Link } from "react-router";

import S from "./LegendLabel.module.css";

interface Props {
  children: ReactNode;
  className?: string;
  href?: LinkProps["to"];
}

export const LegendLabel = ({ children, className, href }: Props) => {
  if (!href) {
    return <div className={cx(S.text, className)}>{children}</div>;
  }

  return (
    <Link className={cx(S.text, S.link, className)} to={href}>
      {children}
    </Link>
  );
};

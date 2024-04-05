import classNames from "classnames";
import type { ReactNode } from "react";
import type { LinkProps } from "react-router";
import { Link } from "react-router";

import styles from "./LegendLabel.module.css";

interface Props {
  children: ReactNode;
  className?: string;
  href?: LinkProps["to"];
}

export const LegendLabel = ({ children, className, href }: Props) => {
  if (!href) {
    return <div className={classNames(styles.text, className)}>{children}</div>;
  }

  return (
    <Link className={classNames(styles.text, styles.link, className)} to={href}>
      {children}
    </Link>
  );
};

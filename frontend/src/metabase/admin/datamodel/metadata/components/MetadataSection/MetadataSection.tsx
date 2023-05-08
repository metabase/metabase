import React, { ReactNode } from "react";
import cx from "classnames";

interface MetadataSectionProps {
  first?: boolean;
  last?: boolean;
  children?: ReactNode;
}

const MetadataSection = ({ first, last, children }: MetadataSectionProps) => (
  <section
    className={cx("pb4", first ? "mb4" : "my4", { "border-bottom": !last })}
  >
    {children}
  </section>
);

export default MetadataSection;

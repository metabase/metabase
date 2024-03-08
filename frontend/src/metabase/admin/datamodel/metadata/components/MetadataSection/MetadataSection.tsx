import cx from "classnames";
import type { ReactNode } from "react";

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MetadataSection;

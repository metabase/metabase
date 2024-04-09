import cx from "classnames";
import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";

interface MetadataSectionProps {
  first?: boolean;
  last?: boolean;
  children?: ReactNode;
}

const MetadataSection = ({ first, last, children }: MetadataSectionProps) => (
  <section
    className={cx(CS.pb4, first ? CS.mb4 : CS.my4, {
      [CS.borderBottom]: !last,
    })}
  >
    {children}
  </section>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MetadataSection;

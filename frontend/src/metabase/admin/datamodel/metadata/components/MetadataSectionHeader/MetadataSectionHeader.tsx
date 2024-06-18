import cx from "classnames";

import CS from "metabase/css/core/index.css";

interface MetadataSectionHeaderProps {
  title: string;
  description?: string;
}

export const MetadataSectionHeader = ({
  title,
  description,
}: MetadataSectionHeaderProps) => (
  <div className={CS.mb2}>
    <h4>{title}</h4>
    {description && (
      <p className={cx(CS.mb0, CS.textMedium, CS.mt1)}>{description}</p>
    )}
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MetadataSectionHeader;

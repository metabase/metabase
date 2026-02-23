import cx from "classnames";
import Humanize from "humanize-plus";
import { type MouseEvent, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";

interface ExpandableStringProps {
  str?: string;
  length?: number;
}

export function ExpandableString({ str, length = 140 }: ExpandableStringProps) {
  const [expanded, setExpanded] = useState(false);

  if (!str) {
    return null;
  }

  const truncated = Humanize.truncate(str, length);

  const toggleExpansion = (event: MouseEvent) => {
    event.stopPropagation();
    setExpanded((prev) => !prev);
  };

  if (expanded) {
    return (
      <span>
        {str}{" "}
        <span
          className={cx(CS.block, CS.mt1, CS.link)}
          onClick={toggleExpansion}
        >{t`View less`}</span>
      </span>
    );
  } else if (truncated !== str) {
    return (
      <span>
        {truncated}{" "}
        <span
          className={cx(CS.block, CS.mt1, CS.link)}
          onClick={toggleExpansion}
        >{t`View more`}</span>
      </span>
    );
  } else {
    return <span>{str}</span>;
  }
}

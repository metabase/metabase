/* eslint-disable react/prop-types */
import cx from "classnames";
import { memo } from "react";

import Tooltip from "metabase/core/components/Tooltip";
import { Icon } from "metabase/ui";

const TitleAndDescription = ({ title, description, className }) => (
  <div className={cx("flex align-center", className)}>
    <h2 className="h2 mr1 text-wrap">{title}</h2>
    {description && (
      <Tooltip tooltip={description} maxWidth="22em">
        <Icon name="info" className="mx1" />
      </Tooltip>
    )}
  </div>
);

export default memo(TitleAndDescription);

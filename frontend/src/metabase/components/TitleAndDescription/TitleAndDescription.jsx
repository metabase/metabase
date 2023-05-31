/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";

import { Icon } from "metabase/core/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";

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

export default React.memo(TitleAndDescription);

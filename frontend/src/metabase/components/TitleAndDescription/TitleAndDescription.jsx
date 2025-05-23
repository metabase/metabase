/* eslint-disable react/prop-types */
import cx from "classnames";
import { memo } from "react";

import CS from "metabase/css/core/index.css";
import { Icon, Tooltip } from "metabase/ui";

const TitleAndDescription = ({ title, description, className }) => (
  <div className={cx(CS.flex, CS.alignCenter, className)}>
    <h2 className={cx(CS.h2, CS.mr1, CS.textWrap)}>{title}</h2>
    {description && (
      <Tooltip label={description} maw="22em">
        <Icon name="info" className={CS.mx1} />
      </Tooltip>
    )}
  </div>
);

export default memo(TitleAndDescription);

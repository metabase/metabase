/* eslint-disable react/prop-types */
import cx from "classnames";
import { memo } from "react";

import CS from "metabase/css/core/index.css";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Icon, Tooltip } from "metabase/ui";

const TitleAndDescription = ({ title, description, className }) => {
  const tc = useTranslateContent();
  return (
    <div className={cx(CS.flex, CS.alignCenter, className)}>
      <h2 className={cx(CS.h2, CS.mr1, CS.textWrap)}>{tc(title)}</h2>
      {description && (
        <Tooltip label={description} maw="22em">
          <Icon name="info" className={CS.mx1} />
        </Tooltip>
      )}
    </div>
  );
};

export default memo(TitleAndDescription);

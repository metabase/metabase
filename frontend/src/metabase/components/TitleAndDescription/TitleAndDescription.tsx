import cx from "classnames";
import { type ReactNode, memo } from "react";

import Tooltip from "metabase/core/components/Tooltip";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

const TitleAndDescription = ({
  title,
  description,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) => (
  <div className={cx(CS.flex, CS.alignCenter, className)}>
    <h2 className={cx(CS.h2, CS.mr1, CS.textWrap)}>{title}</h2>
    {description && (
      <Tooltip tooltip={description} maxWidth="22em">
        <Icon name="info" className={CS.mx1} />
      </Tooltip>
    )}
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(TitleAndDescription);

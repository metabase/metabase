import cx from "classnames";
import { memo } from "react";

import CS from "metabase/css/core/index.css";
import { Box, type BoxProps, Icon, Tooltip } from "metabase/ui";

const TitleAndDescriptionInner = ({
  title,
  description,
  className,
  ...boxProps
}: {
  title: string | null;
  description: string | null;
  className?: string;
} & BoxProps) => (
  <Box className={cx(CS.flex, CS.alignCenter, className)} {...boxProps}>
    <h2 className={cx(CS.h2, CS.mr1, CS.textWrap)}>{title}</h2>
    {description && (
      <Tooltip label={description} maw="22em">
        <Icon name="info" className={CS.mx1} />
      </Tooltip>
    )}
  </Box>
);

export const TitleAndDescription = memo(TitleAndDescriptionInner);

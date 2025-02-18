import cx from "classnames";

import { isEmbeddingSdk } from "metabase/env";
import { Box, type BoxProps } from "metabase/ui";

import S from "./DashboardGrid.module.css";

export const DashboardCardContainer = (
  props: BoxProps & {
    children?: React.ReactNode;
    isAnimationDisabled?: boolean;
  },
) => {
  const { className, isAnimationDisabled, ...rest } = props;

  return (
    <Box
      className={cx(
        S.DashboardCardContainer,
        {
          [S.isEmbeddingSdk]: isEmbeddingSdk,
          [S.isAnimationDisabled]: isAnimationDisabled,
        },
        className,
      )}
      {...rest}
    />
  );
};

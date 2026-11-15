import cx from "classnames";

import { Box } from "metabase/ui";

import S from "./SetupCardContainer.module.css";

type SetupCardContainerProps = {
  isVisible: boolean;
  children?: React.ReactNode;
};

export const SetupCardContainer = ({
  isVisible,
  children,
}: SetupCardContainerProps) => (
  <Box className={cx(S.root, { [S.visible]: isVisible })}>{children}</Box>
);

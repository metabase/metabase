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
  <Box
    className={cx(S.root, { [S.visible]: isVisible })}
    display={{ base: isVisible ? "block" : "none", lg: "block" }}
    pos={{ lg: "fixed" }}
    right={{ lg: "2em" }}
    bottom={{ lg: "2em" }}
    maw={{ lg: "20%" }}
    mb={{ base: "xl", lg: 0 }}
  >
    {children}
  </Box>
);

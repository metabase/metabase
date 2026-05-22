import cx from "classnames";
import type { PropsWithChildren } from "react";

import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";
import CS from "metabase/css/core/index.css";
import { Flex } from "metabase/ui";

import SdkDashboardStyleWrapperS from "./SdkDashboardStyleWrapper.module.css";

export const SdkDashboardStyledWrapper = ({
  className,
  style,
  children,
}: PropsWithChildren<CommonStylingProps>) => {
  return (
    <Flex
      direction="column"
      justify="flex-start"
      align="stretch"
      className={cx(
        className,
        SdkDashboardStyleWrapperS.SdkDashboardStyleWrapper,
        CS.overflowAuto,
      )}
      style={style}
      data-testid="sdk-dashboard-styled-wrapper"
    >
      {children}
    </Flex>
  );
};

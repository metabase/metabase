import cx from "classnames";
import type { PropsWithChildren } from "react";

import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";
import CS from "metabase/css/core/index.css";
import { Flex } from "metabase/ui";

import SdkDashboardStyleWrapperS from "./SdkDashboardStyleWrapper.module.css";

export const SdkDashboardStyledWrapper = ({
  className,
  style,
  fullHeight = false,
  children,
}: PropsWithChildren<
  CommonStylingProps & {
    /**
     * Stretches the child to the wrapper's height, so children sized with
     * percentage heights have something to resolve against.
     */
    fullHeight?: boolean;
  }
>) => {
  return (
    <Flex
      direction="column"
      justify="flex-start"
      align="stretch"
      className={cx(
        className,
        SdkDashboardStyleWrapperS.SdkDashboardStyleWrapper,
        fullHeight && SdkDashboardStyleWrapperS.FullHeight,
        CS.overflowAuto,
      )}
      style={style}
      data-testid="sdk-dashboard-styled-wrapper"
    >
      {children}
    </Flex>
  );
};

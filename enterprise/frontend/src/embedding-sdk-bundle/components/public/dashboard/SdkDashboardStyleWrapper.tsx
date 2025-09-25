import cx from "classnames";
import { type PropsWithChildren, forwardRef } from "react";

import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";
import CS from "metabase/css/core/index.css";
import { useDashboardContext } from "metabase/dashboard/context";
import { Flex } from "metabase/ui";

export const SdkDashboardStyledWrapper = forwardRef(
  function SdkDashboardStyledWrapperInner(
    { className, style, children }: PropsWithChildren<CommonStylingProps>,
    fullscreenRef: React.Ref<HTMLDivElement>,
  ) {
    return (
      <Flex
        bg="bg-dashboard"
        direction="column"
        justify="flex-start"
        align="stretch"
        className={cx(className, CS.overflowAuto)}
        style={{
          // Gives a chance to override the height if needed
          height: "100vh",
          ...style,
        }}
        ref={fullscreenRef}
      >
        {children}
      </Flex>
    );
  },
);

export const SdkDashboardStyledWrapperWithRef = ({
  className,
  style,
  children,
}: PropsWithChildren<CommonStylingProps>) => {
  const { fullscreenRef } = useDashboardContext();

  return (
    <SdkDashboardStyledWrapper
      className={className}
      style={style}
      ref={fullscreenRef}
    >
      {children}
    </SdkDashboardStyledWrapper>
  );
};

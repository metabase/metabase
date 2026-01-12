import cx from "classnames";
import { type PropsWithChildren, forwardRef } from "react";

import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";
import CS from "metabase/css/core/index.css";
import { useDashboardContext } from "metabase/dashboard/context";
import { isEmbeddingEajs } from "metabase/embedding-sdk/config";
import { Flex } from "metabase/ui";

export const SdkDashboardStyledWrapper = forwardRef(
  function SdkDashboardStyledWrapperInner(
    { className, style, children }: PropsWithChildren<CommonStylingProps>,
    fullscreenRef: React.Ref<HTMLDivElement>,
  ) {
    return (
      <Flex
        direction="column"
        justify="flex-start"
        align="stretch"
        className={cx(className, CS.overflowAuto)}
        style={{
          minHeight: isEmbeddingEajs()
            ? "100%" // to respect grid-template-columns styles in SdkIframeEmbedRoute
            : "100vh",
          backgroundColor: "var(--mb-color-bg-dashboard)",
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

import { css } from "@emotion/react";
import styled from "@emotion/styled";
import cx from "classnames";

import {
  LoadingAndErrorWrapper,
  type LoadingAndErrorWrapperProps,
} from "metabase/components/LoadingAndErrorWrapper";
import ColorS from "metabase/css/core/colors.module.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { isEmbeddingSdk } from "metabase/env";
import ParametersS from "metabase/parameters/components/ParameterValueWidget.module.css";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { breakpointMaxSmall, space } from "metabase/styled-components/theme";
import { SAVING_DOM_IMAGE_CLASS } from "metabase/visualizations/lib/save-chart-image";

interface DashboardLoadingAndErrorWrapperProps
  extends LoadingAndErrorWrapperProps {
  isFullscreen: boolean;
  isNightMode: boolean;
  isFullHeight: boolean;
}

export const DashboardLoadingAndErrorWrapper = styled(
  ({
    isFullscreen,
    isNightMode,
    className,
    ...props
  }: DashboardLoadingAndErrorWrapperProps) => {
    return (
      <LoadingAndErrorWrapper
        className={cx(className, DashboardS.Dashboard, {
          [DashboardS.DashboardFullscreen]: isFullscreen,
          [DashboardS.DashboardNight]: isNightMode,
          [ParametersS.DashboardNight]: isNightMode,
          [ColorS.DashboardNight]: isNightMode,
        })}
        {...props}
      />
    );
  },
)`
  min-height: 100%;
  height: 1px;
  /* prevents header from scrolling so we can have a fixed sidebar */
  ${({ isFullHeight }) =>
    isFullHeight &&
    css`
      height: 100%;
    `}
`;

export const DashboardStyled = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  min-height: 100%;
  width: 100%;
`;

export const DashboardBody = styled.div<{ isEditingOrSharing: boolean }>`
  position: relative;
  display: flex;
  flex: 1 0 auto;
  min-width: 0;
  min-height: 0;

  ${({ isEditingOrSharing }) =>
    isEditingOrSharing &&
    css`
      flex-basis: 0;
    `}
`;

export const DashboardHeaderContainer = styled.header<{
  isFullscreen: boolean;
  isNightMode: boolean;
}>`
  position: relative;
  z-index: 2;
  background-color: var(--mb-color-background);
  border-bottom: 1px solid var(--mb-color-border);

  ${({ isFullscreen }) =>
    isFullscreen &&
    css`
      background-color: transparent;
      border: none;
    `}

  ${({ isNightMode }) =>
    isNightMode &&
    css`
      color: var(--mb-color-text-white);
    `}
`;

export const CardsContainer = styled(FullWidthContainer)`
  margin-top: 8px;
`;

export function getDashboardBodyBgColor(isNightMode: boolean) {
  if (isEmbeddingSdk) {
    return "var(--mb-color-bg-dashboard)";
  }

  return isNightMode ? "var(--mb-color-bg-black)" : "var(--mb-color-bg-light)";
}

export const ParametersWidgetContainer = styled(FullWidthContainer)<{
  allowSticky: boolean;
  isSticky: boolean;
  isNightMode: boolean;
}>`
  padding-top: ${space(1)};
  padding-bottom: ${space(1)};
  /* z-index should be higher than in dashcards */
  z-index: 3;
  top: 0;
  left: 0;
  /* this is for proper transitions from the \`transparent\` value to other values if set */
  border-bottom: 1px solid transparent;

  ${({ allowSticky }) =>
    allowSticky &&
    css`
      position: sticky;
    `}

  ${({ isNightMode, isSticky }) =>
    isSticky &&
    css`
      background-color: ${getDashboardBodyBgColor(isNightMode)};
      border-bottom-color: var(--mb-color-border);
    `}

  ${({ isNightMode }) =>
    isNightMode &&
    css`
      --mb-color-text-secondary: color-mix(
        in srgb,
        var(--mb-base-color-white) 65%,
        transparent
      );
      --mb-color-border: var(--mb-base-color-orion-60);
      --mb-color-background: var(--mb-color-bg-black);
    `}
`;

export const ParametersAndCardsContainer = styled.div<{
  shouldMakeDashboardHeaderStickyAfterScrolling: boolean;
  isEmpty: boolean;
}>`
  flex: auto;
  min-width: 0;
  overflow-y: ${({ shouldMakeDashboardHeaderStickyAfterScrolling }) =>
    shouldMakeDashboardHeaderStickyAfterScrolling ? "auto" : "visible"};
  overflow-x: hidden;
  scroll-behavior: smooth;

  @supports (overflow-x: clip) {
    overflow-x: clip;
  }

  padding-bottom: 40px;
  /* Makes sure it doesn't use all the height, so the actual content height could be used in embedding #37437 */
  align-self: ${({ shouldMakeDashboardHeaderStickyAfterScrolling, isEmpty }) =>
    !shouldMakeDashboardHeaderStickyAfterScrolling && !isEmpty && "flex-start"};
`;

export const FIXED_WIDTH = "1048px";
export const FixedWidthContainer = styled.div<{
  isFixedWidth: boolean;
}>`
  width: 100%;

  ${({ isFixedWidth }) =>
    isFixedWidth &&
    css`
      margin: 0 auto;
      max-width: ${FIXED_WIDTH};
    `}

  .${SAVING_DOM_IMAGE_CLASS} & {
    legend {
      top: -9px;
    }
  }
`;

export const ParametersFixedWidthContainer = styled(FixedWidthContainer)`
  display: flex;
  flex-direction: row;
  align-items: flex-start;

  ${breakpointMaxSmall} {
    flex-direction: column;
  }
`;

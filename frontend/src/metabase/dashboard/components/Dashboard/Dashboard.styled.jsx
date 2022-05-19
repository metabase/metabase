import React from "react";
import cx from "classnames";
import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { IFRAMED } from "metabase/lib/dom";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { APP_BAR_HEIGHT, NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";

// Class names are added here because we still use traditional css,
// see dashboard.css
export const DashboardLoadingAndErrorWrapper = styled(
  ({ isFullscreen, isNightMode, className, ...props }) => {
    return (
      <LoadingAndErrorWrapper
        className={cx(className, "Dashboard", {
          "Dashboard--fullscreen": isFullscreen,
          "Dashboard--night": isNightMode,
        })}
        {...props}
      />
    );
  },
)`
  flex: 1 0 auto;

  // prevents header from scrolling so we can have a fixed sidebar
  ${({ isFullHeight }) =>
    isFullHeight &&
    css`
      height: 100%;
    `}
`;

export const DashboardStyled = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-x: hidden;
  width: 100%;
`;

export const DashboardBody = styled.div`
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

export const HeaderContainer = styled.header`
  background-color: white;
  border-bottom: 1px solid ${color("border")};
  position: relative;
  z-index: 2;

  ${({ isFullscreen }) =>
    isFullscreen &&
    css`
      background-color: transparent;
      border: none;
    `}

  ${({ isNightMode }) =>
    isNightMode &&
    css`
      color: ${color("text-white")};
    `}
`;

export const ParametersAndCardsContainer = styled.div`
  flex: auto;
  overflow-x: hidden;
`;

export const ParametersWidgetContainer = styled(FullWidthContainer)`
  align-items: flex-start;
  background-color: ${color("bg-light")};
  border-bottom: 1px solid ${color("bg-light")};
  display: flex;
  flex-direction: column;
  padding-top: ${space(2)};
  padding-bottom: ${space(1)};
  z-index: 4;

  ${({ isEditing }) =>
    isEditing &&
    css`
      border-top: 1px solid ${color("border")};
    `}

  ${({ isSticky }) =>
    isSticky &&
    css`
      border-bottom: 1px solid ${color("border")};
      position: fixed;
      top: 0;
      left: 0;
    `}

  ${({ isSticky, isNavbarOpen }) =>
    isSticky &&
    isNavbarOpen &&
    !IFRAMED &&
    css`
      width: calc(100% - ${NAV_SIDEBAR_WIDTH});
      left: ${NAV_SIDEBAR_WIDTH};
      top: ${APP_BAR_HEIGHT};
    `}
`;

export const CardsContainer = styled(FullWidthContainer)`
  ${({ addMarginTop }) =>
    addMarginTop &&
    css`
      margin-top: ${space(2)};
    `}
`;

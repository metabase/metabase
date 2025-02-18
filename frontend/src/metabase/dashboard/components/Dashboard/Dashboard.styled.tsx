import { css } from "@emotion/react";
import styled from "@emotion/styled";
import cx from "classnames";

import {
  LoadingAndErrorWrapper,
  type LoadingAndErrorWrapperProps,
} from "metabase/components/LoadingAndErrorWrapper";
import ColorS from "metabase/css/core/colors.module.css";
import DashboardS from "metabase/css/dashboard.module.css";
import ParametersS from "metabase/parameters/components/ParameterValueWidget.module.css";
import { SAVING_DOM_IMAGE_CLASS } from "metabase/visualizations/lib/save-chart-image";

import S from "./Dashboard.module.css";

interface DashboardLoadingAndErrorWrapperProps
  extends LoadingAndErrorWrapperProps {
  isFullscreen: boolean;
  isNightMode: boolean;
  isFullHeight: boolean;
}

export const DashboardLoadingAndErrorWrapper = ({
  isFullscreen,
  isNightMode,
  isFullHeight,
  className,
  ...props
}: DashboardLoadingAndErrorWrapperProps) => {
  return (
    <LoadingAndErrorWrapper
      className={cx(
        className,
        DashboardS.Dashboard,
        S.DashboardLoadingAndErrorWrapper,
        {
          [DashboardS.DashboardFullscreen]: isFullscreen,
          [DashboardS.DashboardNight]: isNightMode,
          [ParametersS.DashboardNight]: isNightMode,
          [ColorS.DashboardNight]: isNightMode,
          [S.isFullHeight]: isFullHeight,
        },
      )}
      {...props}
    />
  );
};

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

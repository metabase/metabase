import cx from "classnames";

import {
  LoadingAndErrorWrapper,
  type LoadingAndErrorWrapperProps,
} from "metabase/components/LoadingAndErrorWrapper";
import ColorS from "metabase/css/core/colors.module.css";
import DashboardS from "metabase/css/dashboard.module.css";
import ParametersS from "metabase/parameters/components/ParameterValueWidget.module.css";
import { Box, type BoxProps } from "metabase/ui";

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
export const FixedWidthContainer = (
  props: BoxProps & {
    isFixedWidth: boolean;
    children: React.ReactNode;
    id?: string;
  },
) => {
  const { isFixedWidth, className, ...rest } = props;

  return (
    <Box
      w="100%"
      className={cx(
        S.FixedWidthContainer,
        { [S.isFixedWidth]: isFixedWidth },
        className,
      )}
      style={{
        "--dashboard-fixed-width": FIXED_WIDTH,
      }}
      {...rest}
    />
  );
};

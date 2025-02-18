import cx from "classnames";
import { forwardRef } from "react";

import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import type { BoxProps } from "metabase/ui";

import { FixedWidthContainer } from "./Dashboard/DashboardComponents";
import S from "./DashboardHeaderView.module.css";

export const HeaderFixedWidthContainer = (
  props: BoxProps & {
    isNavBarOpen?: boolean;
    children?: React.ReactNode;
    isFixedWidth?: boolean;
  },
) => {
  const { isNavBarOpen, className, ...rest } = props;

  return (
    <FixedWidthContainer
      className={cx(
        S.HeaderFixedWidthContainer,
        {
          [S.isNavBarOpen]: isNavBarOpen,
        },
        className,
      )}
      {...rest}
    />
  );
};

export const HeaderRow = forwardRef<
  HTMLDivElement,
  BoxProps & { children?: React.ReactNode }
>(function HeaderRow(props, ref) {
  return <FullWidthContainer ref={ref} className={S.HeaderRow} {...props} />;
});

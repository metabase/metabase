import cx from "classnames";
import type { ReactNode } from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";

import S from "./ScalarValueContainer.module.css";

interface ScalarContainerWrapperProps {
  tooltip?: ReactNode;
  alwaysShowTooltip?: boolean;
  isClickable: boolean;
  children?: ReactNode;
  className?: string;
}

export const ScalarValueContainer = ({
  tooltip,
  alwaysShowTooltip,
  children,
  isClickable,
  className,
}: ScalarContainerWrapperProps) => {
  return (
    <Ellipsified
      className={cx(className, S.container, isClickable && S.clickable)}
      tooltip={tooltip}
      alwaysShowTooltip={alwaysShowTooltip}
      data-testid="scalar-container"
    >
      {children}
    </Ellipsified>
  );
};

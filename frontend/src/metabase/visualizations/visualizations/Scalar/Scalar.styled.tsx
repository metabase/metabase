// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import type { ReactNode } from "react";

import { useIsTruncated } from "metabase/common/hooks/use-is-truncated";
import { Tooltip } from "metabase/ui";

interface ScalarContainerProps {
  isClickable: boolean;
}

const ScalarContainerInner = styled.div<ScalarContainerProps>`
  padding: 0 var(--mantine-spacing-sm);
  max-width: 100%;
  box-sizing: border-box;

  ${({ isClickable }) =>
    isClickable &&
    css`
      cursor: pointer;

      &:hover {
        color: var(--mb-color-brand);
      }
    `}
`;

interface ScalarContainerWrapperProps extends ScalarContainerProps {
  tooltip?: ReactNode;
  alwaysShowTooltip?: boolean;
  children?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

export const ScalarContainer = ({
  tooltip,
  alwaysShowTooltip,
  children,
  isClickable,
  className,
  "data-testid": dataTestId,
  ...props
}: ScalarContainerWrapperProps) => {
  const { isTruncated, ref } = useIsTruncated<HTMLDivElement>({
    disabled: !alwaysShowTooltip,
  });
  const isEnabled = alwaysShowTooltip || isTruncated;

  return (
    <Tooltip
      disabled={!isEnabled}
      label={tooltip || children || " "}
      position="top"
    >
      <ScalarContainerInner
        ref={ref}
        isClickable={isClickable}
        className={className}
        data-testid={dataTestId}
        {...props}
      >
        {children}
      </ScalarContainerInner>
    </Tooltip>
  );
};

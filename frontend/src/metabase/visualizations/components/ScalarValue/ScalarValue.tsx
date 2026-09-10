import cx from "classnames";
import { type HTMLAttributes, type PropsWithChildren, forwardRef } from "react";
import { t } from "ttag";

import DashboardS from "metabase/css/dashboard.module.css";
import { Box, Flex, useMantineTheme } from "metabase/ui";

import S from "./ScalarValue.module.css";

type ScalarWrapperProps = PropsWithChildren<{ xPadding?: number }> &
  HTMLAttributes<HTMLDivElement>;

export const ScalarWrapper = forwardRef<HTMLDivElement, ScalarWrapperProps>(
  function ScalarWrapper({ children, xPadding, ...props }, ref) {
    return (
      <Flex
        ref={ref}
        pos="relative"
        direction="column"
        justify="center"
        align="center"
        flex={1}
        w="100%"
        h="100%"
        px={xPadding}
        data-testid="scalar-root"
        {...props}
      >
        {children}
      </Flex>
    );
  },
);

interface ScalarValueProps {
  value: string;
  fontSize: number;
  color?: string;
  disableHover?: boolean;
}

export const ScalarValue = ({
  value,
  fontSize,
  color = "inherit",
  disableHover,
}: ScalarValueProps) => {
  const {
    other: { number: numberTheme },
  } = useMantineTheme();

  return (
    <Box
      component="h1"
      className={cx(
        DashboardS.ScalarValue,
        S.value,
        !disableHover && S.hoverable,
      )}
      fz={numberTheme?.value?.fontSize ?? fontSize}
      lh={numberTheme?.value?.lineHeight ?? 1}
      data-testid="scalar-value"
      // Route color through a CSS variable so `S.hoverable:hover` can override (inline `style` would beat the class on specificity).
      style={{ "--scalar-value-color": color }}
    >
      {value ?? t`null`}
    </Box>
  );
};

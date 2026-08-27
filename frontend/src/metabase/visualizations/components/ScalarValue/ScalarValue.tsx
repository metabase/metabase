/*
 * Shared components for Scalar and SmartScalar to make sure our number presentation stays in sync
 */
import cx from "classnames";
import type { PropsWithChildren, ReactNode } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { Box, Ellipsified, Flex, useMantineTheme } from "metabase/ui";

import S from "./ScalarValue.module.css";
import type { ScalarSizeTier } from "./sizing";

export const ScalarWrapper = ({
  children,
  xPadding,
}: PropsWithChildren<{ xPadding?: number }>) => (
  <Flex
    pos="relative"
    direction="column"
    justify="center"
    align="center"
    flex={1}
    w="100%"
    h="100%"
    px={xPadding}
    data-testid="scalar-root"
  >
    {children}
  </Flex>
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

export const ScalarTitle = ({ children }: { children: ReactNode }) => (
  <Box
    component="h3"
    fz={14}
    lh={1.22}
    fw={700}
    c="text-primary"
    ta="center"
    maw="100%"
    data-testid="scalar-title"
  >
    <Ellipsified tooltip={children}>{children}</Ellipsified>
  </Box>
);

export const ScalarActionButtons = ({
  children,
  tier,
}: PropsWithChildren<{ tier: ScalarSizeTier }>) => {
  if (!children) {
    return null;
  }
  return (
    <Box
      pos="absolute"
      top={tier.menuOffset.top}
      right={tier.menuOffset.right}
      className={CS.hoverChild}
      data-testid="scalar-action-buttons"
    >
      {children}
    </Box>
  );
};

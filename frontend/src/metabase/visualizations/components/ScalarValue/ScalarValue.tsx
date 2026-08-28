/*
 * Shared components for Scalar and SmartScalar to make sure our number presentation stays in sync
 */
import cx from "classnames";
import {
  type HTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
  forwardRef,
  useCallback,
  useState,
} from "react";
import { t } from "ttag";

import DashboardS from "metabase/css/dashboard.module.css";
import { Box, Ellipsified, Flex, useMantineTheme } from "metabase/ui";

import { LegendLabel } from "../legend/LegendLabel";

import S from "./ScalarValue.module.css";
import type { ScalarSizeTier } from "./sizing";

// the default Tooltip offset keeps an 8px gap between the arrow tip and the
// target; the card title tooltip should touch the card border instead
export const TITLE_TOOLTIP_OFFSET = 1;

type ScalarWrapperProps = PropsWithChildren<{ xPadding?: number }> &
  HTMLAttributes<HTMLDivElement>;

// forwards the ref and extra props so it can be a Tooltip target
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

const TITLE_HREF_PLACEHOLDER = "#";

interface ScalarTitleProps {
  children: ReactNode;
  getHref?: () => string | undefined;
  onSelectTitle?: () => void;
}

export const ScalarTitle = ({
  children,
  getHref,
  onSelectTitle,
}: ScalarTitleProps) => {
  const [href, setHref] = useState(
    getHref ? TITLE_HREF_PLACEHOLDER : undefined,
  );
  const computeHref = useCallback(() => {
    if (getHref) {
      setHref(getHref());
    }
  }, [getHref]);

  const title = <Ellipsified tooltip={children}>{children}</Ellipsified>;

  return (
    <Box
      fz="md"
      lh="md"
      fw={700}
      c="text-primary"
      ta="center"
      maw="100%"
      data-testid="scalar-title"
    >
      {onSelectTitle ? (
        <LegendLabel
          className={S.titleLink}
          href={href}
          onClick={onSelectTitle}
          onFocus={computeHref}
          onMouseEnter={computeHref}
        >
          {title}
        </LegendLabel>
      ) : (
        title
      )}
    </Box>
  );
};

export const ScalarActionButtons = ({
  children,
  tier,
  ...props
}: PropsWithChildren<{ tier: ScalarSizeTier }> &
  HTMLAttributes<HTMLDivElement>) => {
  if (!children) {
    return null;
  }
  return (
    <Box
      pos="absolute"
      top={tier.menuOffset.top}
      right={tier.menuOffset.right}
      className={S.actionButtons}
      data-testid="scalar-action-buttons"
      {...props}
    >
      {children}
    </Box>
  );
};

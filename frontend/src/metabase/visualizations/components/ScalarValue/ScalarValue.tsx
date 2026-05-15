/*
 * Shared component for Scalar and SmartScalar to make sure our number presentation stays in sync
 */
import cx from "classnames";
import { type CSSProperties, type PropsWithChildren, useMemo } from "react";
import { t } from "ttag";

import DashboardS from "metabase/css/dashboard.module.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { Box, Flex, useMantineTheme } from "metabase/ui";
import type { VisualizationGridSize } from "metabase/visualizations/types";

import S from "./ScalarValue.module.css";
import { findSize, getMaxFontSize } from "./utils";

export const ScalarWrapper = ({ children }: PropsWithChildren) => (
  <Flex
    pos="relative"
    direction="column"
    wrap="wrap"
    justify="center"
    align="center"
    flex={1}
    w="100%"
    h="100%"
    data-testid="scalar-root"
  >
    {children}
  </Flex>
);

interface ScalarValueProps {
  value: string;
  height: number;
  width: number;
  gridSize?: VisualizationGridSize;
  totalNumGridCols?: number;
  fontFamily: string;
  color?: string;
  disableHover?: boolean;
}

export const ScalarValue = ({
  value,
  height,
  width,
  gridSize,
  totalNumGridCols,
  fontFamily,
  color = "inherit",
  disableHover,
}: ScalarValueProps) => {
  const {
    other: { number: numberTheme },
  } = useMantineTheme();

  const fontSize = useMemo(() => {
    if (numberTheme?.value?.fontSize) {
      return numberTheme.value?.fontSize;
    }

    return findSize({
      text: value,
      targetHeight: height,
      targetWidth: width,
      fontFamily: fontFamily ?? "Lato",
      fontWeight: 700,
      unit: "rem",
      step: 0.2,
      min: 1,
      max: gridSize
        ? getMaxFontSize(gridSize.width, totalNumGridCols, width)
        : 4,
    });
  }, [
    fontFamily,
    gridSize,
    height,
    totalNumGridCols,
    value,
    width,
    numberTheme?.value?.fontSize,
  ]);

  return (
    <Box
      component="h1"
      className={cx(
        DashboardS.ScalarValue,
        QueryBuilderS.ScalarValue,
        S.value,
        !disableHover && S.hoverable,
      )}
      fz={fontSize}
      lh={numberTheme?.value?.lineHeight}
      data-testid="scalar-value"
      // Route color through a CSS variable so `S.hoverable:hover` can override (inline `style` would beat the class on specificity).
      style={{ "--scalar-value-color": color } as CSSProperties}
    >
      {value ?? t`null`}
    </Box>
  );
};

/*
 * Shared component for Scalar and SmartScalar to make sure our number presentation stays in sync
 */
import cx from "classnames";
import { type PropsWithChildren, useMemo } from "react";
import { t } from "ttag";

import DashboardS from "metabase/css/dashboard.module.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { useMantineTheme } from "metabase/ui";
import type { VisualizationGridSize } from "metabase/visualizations/types";

import { ScalarRoot, ScalarValueWrapper } from "./ScalarValue.styled";
import { findSize, getMaxFontSize } from "./utils";

export const ScalarWrapper = ({ children }: PropsWithChildren) => (
  <ScalarRoot data-testid="scalar-root">{children}</ScalarRoot>
);

interface ScalarValueProps {
  value: string;
  height: number;
  width: number;
  gridSize?: VisualizationGridSize;
  totalNumGridCols?: number;
  fontFamily: string;
  color?: string;
}

export const ScalarValue = ({
  value,
  height,
  width,
  gridSize,
  totalNumGridCols,
  fontFamily,
  color = "inherit",
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
    <ScalarValueWrapper
      className={cx(DashboardS.ScalarValue, QueryBuilderS.ScalarValue)}
      fontSize={fontSize}
      lineHeight={numberTheme?.value?.lineHeight}
      data-testid="scalar-value"
      color={color}
    >
      {value ?? t`null`}
    </ScalarValueWrapper>
  );
};

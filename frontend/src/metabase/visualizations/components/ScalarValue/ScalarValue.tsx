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

interface ScalarWrapperProps extends PropsWithChildren {
  cardRowHeight?: number;
}

export const ScalarWrapper = ({
  children,
  cardRowHeight,
}: ScalarWrapperProps) => (
  <ScalarRoot cardRowHeight={cardRowHeight}>{children}</ScalarRoot>
);

interface ScalarValueProps {
  value: string;
  height: number;
  width: number;
  gridSize?: VisualizationGridSize;
  totalNumGridCols?: number;
  fontFamily: string;
}

export const ScalarValue = ({
  value,
  height,
  width,
  gridSize,
  totalNumGridCols,
  fontFamily,
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
      step: 8, // 8px steps for multiples of 8
      min: 16, // 16px minimum (1rem)
      max: gridSize
        ? getMaxFontSize(
            gridSize.width,
            totalNumGridCols,
            width,
            gridSize.height,
          )
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
    <ScalarRoot cardRowHeight={gridSize?.height}>
      <ScalarValueWrapper
        className={cx(DashboardS.ScalarValue, QueryBuilderS.ScalarValue)}
        fontSize={fontSize}
        lineHeight={numberTheme?.value?.lineHeight}
        data-testid="scalar-value"
      >
        {value ?? t`null`}
      </ScalarValueWrapper>
    </ScalarRoot>
  );
};

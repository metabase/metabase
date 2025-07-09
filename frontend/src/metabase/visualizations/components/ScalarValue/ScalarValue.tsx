/*
 * Shared component for Scalar and SmartScalar to make sure our number presentation stays in sync
 */
/* eslint-disable react/prop-types */
import cx from "classnames";
import { type PropsWithChildren, useMemo } from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import Markdown from "metabase/common/components/Markdown";
import DashboardS from "metabase/css/dashboard.module.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { Tooltip, useMantineTheme } from "metabase/ui";
import type { VisualizationGridSize } from "metabase/visualizations/types";

import {
  ScalarDescriptionContainer,
  ScalarDescriptionIcon,
  ScalarDescriptionPlaceholder,
  ScalarRoot,
  ScalarTitleContainer,
  ScalarTitleContent,
  ScalarValueWrapper,
} from "./ScalarValue.styled";
import { findSize, getMaxFontSize } from "./utils";

export const ScalarWrapper = ({ children }: PropsWithChildren) => (
  <ScalarRoot>{children}</ScalarRoot>
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
      step: 0.2,
      min: 1,
      max: gridSize ? getMaxFontSize(gridSize.width, totalNumGridCols) : 4,
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
    >
      {value ?? t`null`}
    </ScalarValueWrapper>
  );
};

interface ScalarTitleProps {
  lines?: number;
  title: string;
  description: string;
  onClick?: () => void;
}

export const ScalarTitle = ({
  lines = 2,
  title,
  description,
  onClick,
}: ScalarTitleProps) => (
  <ScalarTitleContainer data-testid="scalar-title" lines={lines}>
    {/*
      This is a hacky spacer so that the h3 is centered correctly.
      It needs match the width of the tooltip icon on the other side.
     */}
    {description && description.length > 0 && <ScalarDescriptionPlaceholder />}
    <ScalarTitleContent
      className={cx(
        DashboardS.fullscreenNormalText,
        DashboardS.fullscreenNightText,
        EmbedFrameS.fullscreenNightText,
      )}
      onClick={onClick}
    >
      <Ellipsified tooltip={title} lines={lines} placement="bottom">
        {title}
      </Ellipsified>
    </ScalarTitleContent>
    {description && description.length > 0 && (
      <ScalarDescriptionContainer data-testid="scalar-description">
        <Tooltip
          label={
            <Markdown dark disallowHeading unstyleLinks>
              {description}
            </Markdown>
          }
          maw="22em"
        >
          <ScalarDescriptionIcon name="info_filled" />
        </Tooltip>
      </ScalarDescriptionContainer>
    )}
  </ScalarTitleContainer>
);

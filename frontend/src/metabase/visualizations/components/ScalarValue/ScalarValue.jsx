/*
 * Shared component for Scalar and SmartScalar to make sure our number presentation stays in sync
 */
/* eslint-disable react/prop-types */
import { useMemo } from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { useSelector } from "metabase/lib/redux";

import { ChartDescriptionPopover } from "../ChartDescriptionPopover";
import {
  ChartExplainerPopover,
  ChartExplainerType,
} from "../ChartExplainerPopover";

import {
  ScalarRoot,
  ScalarValueWrapper,
  ScalarTitleContainer,
  ScalarDescriptionContainer,
  ScalarDescriptionPlaceholder,
  ScalarTitleContent,
} from "./ScalarValue.styled";
import { findSize, getMaxFontSize } from "./utils";

export const ScalarWrapper = ({ children }) => (
  <ScalarRoot>{children}</ScalarRoot>
);

const ScalarValue = ({
  value,
  height,
  width,
  gridSize,
  totalNumGridCols,
  fontFamily,
}) => {
  const fontSize = useMemo(
    () =>
      findSize({
        text: value,
        targetHeight: height,
        targetWidth: width,
        fontFamily: fontFamily ?? "Lato",
        fontWeight: 900,
        unit: "rem",
        step: 0.2,
        min: 1,
        max: gridSize ? getMaxFontSize(gridSize.width, totalNumGridCols) : 4,
      }),
    [fontFamily, gridSize, height, totalNumGridCols, value, width],
  );

  return (
    <ScalarValueWrapper
      className="ScalarValue"
      fontSize={fontSize}
      data-testid="scalar-value"
    >
      {value ?? t`null`}
    </ScalarValueWrapper>
  );
};

export const ScalarTitle = ({
  lines = 2,
  title,
  description,
  onClick,
  chartExtras,
}) => {
  const enableChartExplainer = useSelector(
    state => state.embed.options.enable_chart_explainer,
  );

  return (
    <ScalarTitleContainer data-testid="scalar-title" lines={lines}>
      {/*
        This is a hacky spacer so that the h3 is centered correctly.
        It needs match the width of the tooltip icon on the other side.
      */}
      {description && description.length > 0 && (
        <ScalarDescriptionPlaceholder />
      )}
      <ScalarTitleContent
        className="fullscreen-normal-text fullscreen-night-text"
        onClick={onClick}
      >
        <Ellipsified tooltip={title} lines={lines} placement="bottom">
          {title}
        </Ellipsified>
      </ScalarTitleContent>
      <ScalarDescriptionContainer data-testid="scalar-description">
        {enableChartExplainer && (
          <>
            <ChartExplainerPopover
              type={ChartExplainerType.SUMMARY}
              title={title}
              chartExtras={chartExtras}
            />

            {description && description.length > 0 ? (
              <ChartDescriptionPopover description={description} />
            ) : (
              <ChartExplainerPopover
                type={ChartExplainerType.DESCRIPTION}
                title={title}
                chartExtras={chartExtras}
              />
            )}
          </>
        )}
      </ScalarDescriptionContainer>
    </ScalarTitleContainer>
  );
};

export default ScalarValue;

/*
 * Shared component for Scalar and SmartScalar to make sure our number presentation stays in sync
 */
/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import Markdown from "metabase/core/components/Markdown";
import Tooltip from "metabase/core/components/Tooltip";
import { useSelector } from "metabase/lib/redux";

import {
  ChartExplanationPopover,
  defaultExplanation,
  getMessageHandler,
  getPopoverHandler,
} from "../ChartExplanationPopover";

import {
  ScalarRoot,
  ScalarValueWrapper,
  ScalarTitleContainer,
  ScalarDescriptionContainer,
  ScalarDescriptionIcon,
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
  const [explanation, setExplanation] = useState(defaultExplanation);
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handlePopover = useCallback(
    getPopoverHandler(
      explanation,
      isExplanationOpen,
      setIsExplanationOpen,
      title,
      chartExtras,
    ),
    [explanation, isExplanationOpen, setIsExplanationOpen, title, chartExtras],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleMessage = useCallback(
    getMessageHandler(setExplanation, chartExtras),
    [setExplanation, chartExtras],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [handleMessage]);

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
          <PopoverWithTrigger
            isOpen={isExplanationOpen}
            triggerElement={
              <ScalarDescriptionIcon
                name="faros"
                className="hover-child hover-child--smooth"
                onClick={handlePopover}
              />
            }
            pinInitialAttachment
            verticalAttachments={["bottom"]}
            alignVerticalEdge
            alignHorizontalEdge={false}
            targetOffsetX={20}
            targetOffsetY={30}
            hasArrow
          >
            <ChartExplanationPopover
              explanation={explanation}
              handlePopover={handlePopover}
            />
          </PopoverWithTrigger>
        )}
        {description && description.length > 0 && (
          <Tooltip
            tooltip={
              <Markdown dark disallowHeading unstyleLinks>
                {description}
              </Markdown>
            }
            maxWidth="22em"
          >
            <ScalarDescriptionIcon
              name="info_filled"
              className="hover-child hover-child--smooth"
            />
          </Tooltip>
        )}
      </ScalarDescriptionContainer>
    </ScalarTitleContainer>
  );
};

export default ScalarValue;

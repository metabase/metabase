import PropTypes from "prop-types";
import React, { useCallback, useEffect, useState } from "react";

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

import LegendActions from "./LegendActions";
import {
  LegendCaptionRoot,
  LegendDescriptionIcon,
  LegendLabel,
  LegendLabelIcon,
  LegendRightContent,
} from "./LegendCaption.styled";

const propTypes = {
  className: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
  icon: PropTypes.object,
  actionButtons: PropTypes.node,
  onSelectTitle: PropTypes.func,
  width: PropTypes.number,
  chartExtras: PropTypes.object,
};

function shouldHideDescription(width) {
  const HIDE_DESCRIPTION_THRESHOLD = 100;
  return width != null && width < HIDE_DESCRIPTION_THRESHOLD;
}

const LegendCaption = ({
  className,
  title,
  description,
  icon,
  actionButtons,
  onSelectTitle,
  width,
  chartExtras,
}) => {
  const enableChartExplainer = useSelector(
    state => state.embed.options.enable_chart_explainer,
  );
  const [explanation, setExplanation] = useState(defaultExplanation);
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);

  const explanationIconRef = React.createRef();

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
    <LegendCaptionRoot className={className} data-testid="legend-caption">
      {icon && <LegendLabelIcon {...icon} />}
      <LegendLabel
        className="fullscreen-normal-text fullscreen-night-text"
        onClick={onSelectTitle}
      >
        <Ellipsified data-testid="legend-caption-title">{title}</Ellipsified>
      </LegendLabel>
      <LegendRightContent>
        {enableChartExplainer && (
          <PopoverWithTrigger
            isOpen={isExplanationOpen}
            triggerElement={
              <LegendDescriptionIcon
                name="faros"
                className="hover-child hover-child--smooth"
                onClick={handlePopover}
                ref={explanationIconRef}
                style={{ verticalAlign: "bottom", paddingBottom: "0.5px" }}
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
        {description && !shouldHideDescription(width) && (
          <Tooltip
            tooltip={
              <Markdown dark disallowHeading unstyleLinks lineClamp={8}>
                {description}
              </Markdown>
            }
            maxWidth="22em"
          >
            <LegendDescriptionIcon className="hover-child hover-child--smooth" />
          </Tooltip>
        )}
        {actionButtons && <LegendActions>{actionButtons}</LegendActions>}
      </LegendRightContent>
    </LegendCaptionRoot>
  );
};

LegendCaption.propTypes = propTypes;

export default LegendCaption;

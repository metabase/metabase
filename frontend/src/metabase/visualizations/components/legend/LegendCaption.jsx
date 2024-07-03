import cx from "classnames";
import PropTypes from "prop-types";
import { useCallback, useState } from "react";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import Markdown from "metabase/core/components/Markdown";
import Tooltip from "metabase/core/components/Tooltip";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { useStore } from "metabase/lib/redux";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";

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
  getHref: PropTypes.func,
  icon: PropTypes.object,
  actionButtons: PropTypes.node,
  onSelectTitle: PropTypes.func,
  width: PropTypes.number,
};

function shouldHideDescription(width) {
  const HIDE_DESCRIPTION_THRESHOLD = 100;
  return width != null && width < HIDE_DESCRIPTION_THRESHOLD;
}

/**
 * Using non-empty href will ensure that a focusable link is rendered.
 * We need a focusable element to handle onFocus.
 * (Using a div with tabIndex={0} breaks the sequence of focusable elements)
 */
const HREF_PLACEHOLDER = "#";

const LegendCaption = ({
  className,
  title,
  description,
  getHref,
  icon,
  actionButtons,
  onSelectTitle,
  width,
}) => {
  const store = useStore();
  /*
   * Optimization: lazy computing the href, which uses getNewCardUrl,
   * which makes a few MLv2 calls, which are expensive. It's a performance issue
   * on dashboards that have hundreds of dashcards.
   */
  const [href, setHref] = useState(getHref ? HREF_PLACEHOLDER : undefined);

  const handleFocus = useCallback(() => {
    if (getHref) {
      const state = store.getState();
      setHref(getHref(state));
    }
  }, [store, getHref]);

  const handleMouseEnter = useCallback(() => {
    if (getHref) {
      const state = store.getState();
      setHref(getHref(state));
    }
  }, [store, getHref]);

  return (
    <LegendCaptionRoot className={className} data-testid="legend-caption">
      {icon && <LegendLabelIcon {...icon} />}
      <LegendLabel
        className={cx(
          DashboardS.fullscreenNormalText,
          DashboardS.fullscreenNightText,
          EmbedFrameS.fullscreenNightText,
        )}
        href={href}
        onClick={onSelectTitle}
        onFocus={handleFocus}
        onMouseEnter={handleMouseEnter}
      >
        <Ellipsified data-testid="legend-caption-title">{title}</Ellipsified>
      </LegendLabel>
      <LegendRightContent>
        {description && !shouldHideDescription(width) && (
          <Tooltip
            tooltip={
              <Markdown dark disallowHeading unstyleLinks lineClamp={8}>
                {description}
              </Markdown>
            }
            maxWidth="22em"
          >
            <LegendDescriptionIcon
              className={cx(CS.hoverChild, CS.hoverChildSmooth)}
            />
          </Tooltip>
        )}
        {actionButtons && <LegendActions>{actionButtons}</LegendActions>}
      </LegendRightContent>
    </LegendCaptionRoot>
  );
};

LegendCaption.propTypes = propTypes;

export default LegendCaption;

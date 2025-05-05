import cx from "classnames";
import { useCallback, useState } from "react";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import Markdown from "metabase/core/components/Markdown";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { useTranslateContent } from "metabase/i18n/hooks";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import type { IconProps } from "metabase/ui";
import { Tooltip } from "metabase/ui";

import LegendActions from "./LegendActions";
import {
  LegendCaptionRoot,
  LegendDescriptionIcon,
  LegendLabel,
  LegendLabelIcon,
  LegendRightContent,
} from "./LegendCaption.styled";

function shouldHideDescription(width: number | undefined) {
  const HIDE_DESCRIPTION_THRESHOLD = 100;
  return width != null && width < HIDE_DESCRIPTION_THRESHOLD;
}

/**
 * Using non-empty href will ensure that a focusable link is rendered.
 * We need a focusable element to handle onFocus.
 * (Using a div with tabIndex={0} breaks the sequence of focusable elements)
 */
const HREF_PLACEHOLDER = "#";

interface LegendCaptionProps {
  className?: string;
  title: string;
  description?: string;
  getHref?: () => string | undefined;
  icon?: IconProps | null;
  actionButtons?: React.ReactNode;
  hasInfoTooltip?: boolean;
  onSelectTitle?: () => void;
  width?: number;
}

export const LegendCaption = ({
  className,
  title,
  description,
  getHref,
  icon,
  actionButtons,
  hasInfoTooltip = true,
  onSelectTitle,
  width,
}: LegendCaptionProps) => {
  /*
   * Optimization: lazy computing the href on title focus & mouseenter only.
   * Href computation uses getNewCardUrl, which makes a few MLv2 calls,
   * which are expensive.
   * It's a performance issue on dashboards that have hundreds of dashcards
   * (during initial render and after changing dashboard parameters which can
   * potentially affect the href).
   */
  const [href, setHref] = useState(getHref ? HREF_PLACEHOLDER : undefined);

  const handleFocus = useCallback(() => {
    if (getHref) {
      setHref(getHref());
    }
  }, [getHref]);

  const handleMouseEnter = useCallback(() => {
    if (getHref) {
      setHref(getHref());
    }
  }, [getHref]);

  const tc = useTranslateContent();
  const translatedTitle = tc(title);

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
        <Ellipsified data-testid="legend-caption-title">
          {translatedTitle}
        </Ellipsified>
      </LegendLabel>
      <LegendRightContent>
        {hasInfoTooltip && description && !shouldHideDescription(width) && (
          <Tooltip
            label={
              <Markdown dark disallowHeading unstyleLinks lineClamp={8}>
                {description}
              </Markdown>
            }
            maw="22em"
          >
            <LegendDescriptionIcon
              name="info"
              className={cx(CS.hoverChild, CS.hoverChildSmooth)}
              mt="2px"
            />
          </Tooltip>
        )}
        {actionButtons && <LegendActions>{actionButtons}</LegendActions>}
      </LegendRightContent>
    </LegendCaptionRoot>
  );
};

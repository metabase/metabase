import cx from "classnames";
import React, { useCallback, useState } from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Markdown } from "metabase/common/components/Markdown";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { useTranslateContent } from "metabase/i18n/hooks";
import type { IconProps } from "metabase/ui";
import { Icon, Menu, Tooltip } from "metabase/ui";
import { SAVING_DOM_IMAGE_OVERFLOW_VISIBLE_CLASS } from "metabase/visualizations/lib/image-exports";

import { LegendActions } from "../LegendActions";

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
  titleMenuItems?: React.ReactNode;
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
  titleMenuItems,
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

  const tc = useTranslateContent();

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

  const hasTitleMenuItems =
    titleMenuItems && React.Children.count(titleMenuItems) > 1;

  const titleElement = (
    <LegendLabel
      className={cx(
        DashboardS.fullscreenNormalText,

        // html2canvas doesn't support `text-overflow: ellipsis` (#45499) https://github.com/niklasvh/html2canvas/issues/324
        SAVING_DOM_IMAGE_OVERFLOW_VISIBLE_CLASS,
      )}
      href={hasTitleMenuItems ? undefined : href}
      onClick={hasTitleMenuItems ? undefined : onSelectTitle}
      onFocus={handleFocus}
      onMouseEnter={handleMouseEnter}
    >
      <Ellipsified
        data-testid="legend-caption-title"
        className={SAVING_DOM_IMAGE_OVERFLOW_VISIBLE_CLASS}
      >
        {tc(title)}
      </Ellipsified>
      {title && hasTitleMenuItems && (
        <Icon
          style={{ flexShrink: 0, marginRight: 10 }}
          name="chevrondown"
          size={10}
          className={CS.ml1}
        />
      )}
    </LegendLabel>
  );

  return (
    <LegendCaptionRoot className={className} data-testid="legend-caption">
      {icon && <LegendLabelIcon {...icon} />}
      {hasTitleMenuItems ? (
        <Menu>
          <Menu.Target>{titleElement}</Menu.Target>
          <Menu.Dropdown data-testid="legend-caption-menu">
            <Menu.Label>{t`Questions in this card`}</Menu.Label>
            {titleMenuItems}
          </Menu.Dropdown>
        </Menu>
      ) : (
        titleElement
      )}
      {hasInfoTooltip && description && !shouldHideDescription(width) && (
        <Tooltip
          label={
            <Markdown dark disallowHeading unstyleLinks lineClamp={8}>
              {tc(description)}
            </Markdown>
          }
          maw="22em"
        >
          <LegendDescriptionIcon
            name="info"
            className={cx(CS.hoverChild, CS.hoverChildSmooth)}
            mt="3px"
            mr="md"
          />
        </Tooltip>
      )}
      <LegendRightContent>
        {actionButtons && <LegendActions>{actionButtons}</LegendActions>}
      </LegendRightContent>
    </LegendCaptionRoot>
  );
};

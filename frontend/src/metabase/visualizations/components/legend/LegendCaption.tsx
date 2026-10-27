import cx from "classnames";
import React, { useCallback, useState } from "react";
import { t } from "ttag";

import { Markdown } from "metabase/common/components/Markdown";
import { useTranslateContent } from "metabase/content-translation/hooks";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import type { IconProps } from "metabase/ui";
import { Box, Ellipsified, Flex, Icon, Menu, Tooltip } from "metabase/ui";
import { SAVING_DOM_IMAGE_OVERFLOW_VISIBLE_CLASS } from "metabase/viz-core";

import { LegendActions } from "./LegendActions";
import { LegendLabel } from "./LegendLabel";
import { LEGEND_LABEL_FONT_SIZE } from "./constants";

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
   * Href computation uses getNewCardUrl, which makes a few Lib calls,
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
        CS.flex,
        CS.alignCenter,
        CS.overflowHidden,
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
        fz={LEGEND_LABEL_FONT_SIZE}
      >
        {tc(title)}
      </Ellipsified>
      {title && hasTitleMenuItems && (
        <Icon
          className={cx(CS.ml1, CS.flexNoShrink)}
          name="chevrondown"
          size={10}
          mr={10}
        />
      )}
    </LegendLabel>
  );

  return (
    <Flex
      className={className}
      align="center"
      miw={0}
      data-testid="legend-caption"
    >
      {icon && (
        <Icon
          {...icon}
          className={cx(CS.flexNoShrink, icon.className)}
          mr="xxs"
        />
      )}
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
            <Markdown dark compact disallowHeading unstyleLinks lineClamp={8}>
              {tc(description)}
            </Markdown>
          }
          maw="22em"
        >
          <Box
            component="span"
            className={cx(
              CS.textLight,
              CS.textMediumHover,
              CS.hoverChild,
              CS.hoverChildSmooth,
            )}
            mt="3px"
            mr="lg"
            ml="xxs"
          >
            <Icon name="info" />
          </Box>
        </Tooltip>
      )}
      {actionButtons && <LegendActions>{actionButtons}</LegendActions>}
    </Flex>
  );
};

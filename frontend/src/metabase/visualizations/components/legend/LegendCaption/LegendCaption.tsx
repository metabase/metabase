import cx from "classnames";
import React, {
  type ReactNode,
  forwardRef,
  useCallback,
  useState,
} from "react";
import { t } from "ttag";

import { Markdown } from "metabase/common/components/Markdown";
import { useTranslateContent } from "metabase/content-translation/hooks";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import {
  Box,
  type BoxProps,
  Ellipsified,
  Flex,
  Icon,
  type IconProps,
  Menu,
  Tooltip,
} from "metabase/ui";
import { SAVING_DOM_IMAGE_OVERFLOW_VISIBLE_CLASS } from "metabase/viz-core";

import { LegendActions } from "../LegendActions";
import { LegendLabel } from "../LegendLabel";

import S from "./LegendCaption.module.css";

export const LEGEND_LABEL_FONT_SIZE = "0.875rem";
export const LEGEND_LABEL_FONT_WEIGHT = 700;

const TITLE_SIZE_CLASSES = {
  sm: { root: S.rootSm, label: S.labelSm },
  md: { root: S.rootMd, label: S.labelMd },
} as const;

export type LegendCaptionTitleSize = keyof typeof TITLE_SIZE_CLASSES;

export const LegendDescriptionIcon = forwardRef<
  HTMLDivElement,
  BoxProps & {
    name?: IconProps["name"];
    inCappedRow?: boolean;
    "data-testid"?: string;
  }
>(function LegendDescriptionIcon(
  { name = "info", inCappedRow, className, ...props },
  ref,
) {
  return (
    <Box
      component="span"
      ref={ref}
      className={cx(
        S.descriptionIcon,
        { [S.descriptionIconCapped]: inCappedRow },
        className,
      )}
      {...props}
    >
      <Icon name={name} />
    </Box>
  );
});

export const LegendRightContent = ({ children }: { children?: ReactNode }) => (
  <Flex justify="flex-end" ms="auto" align="center">
    {children}
  </Flex>
);

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
  titleSize?: LegendCaptionTitleSize;
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
  titleSize,
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

  const sizeClasses = titleSize ? TITLE_SIZE_CLASSES[titleSize] : undefined;

  const titleElement = (
    <LegendLabel
      className={cx(
        S.label,
        sizeClasses?.label,
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
    <Flex
      align="center"
      miw={0}
      className={cx(sizeClasses?.root, className)}
      data-testid="legend-caption"
    >
      {icon && <Icon {...icon} className={cx(S.labelIcon, icon.className)} />}
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
          <LegendDescriptionIcon
            name="info"
            className={cx(CS.hoverChild, CS.hoverChildSmooth)}
            inCappedRow={titleSize != null}
            mt={titleSize != null ? undefined : "3px"}
            me="lg"
          />
        </Tooltip>
      )}
      <LegendRightContent>
        {actionButtons && <LegendActions>{actionButtons}</LegendActions>}
      </LegendRightContent>
    </Flex>
  );
};

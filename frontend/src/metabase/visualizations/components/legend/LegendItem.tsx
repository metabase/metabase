import cx from "classnames";
import { memo, useState } from "react";
import { match } from "ts-pattern";

import DashboardS from "metabase/css/dashboard.module.css";
import { Box, Ellipsified, Flex, rem } from "metabase/ui";
import * as Urls from "metabase/urls";

import S from "./Legend.module.css";
import { LegendItemDot } from "./LegendItemDot";
import { LEGEND_SIZES, type LegendSize } from "./layout";

// Before the real URL is computed, a non-empty href keeps the title a
// focusable link, so focusing it can trigger that computation.
const HREF_PLACEHOLDER = "#";

type SeriesHref =
  | { status: "pending" }
  | { status: "resolved"; href: string | undefined };

export interface LegendItemData {
  key: string;
  color: string;
  name: string;
  visible?: boolean;
}

interface LegendItemProps {
  item: LegendItemData;
  size?: LegendSize;
  index: number;
  isMuted?: boolean;
  isReversed?: boolean;
  onHoverChange?: (data?: { index: number; element: Element }) => void;
  onSelectSeries?: (
    event: React.MouseEvent,
    index: number,
    isReversed?: boolean,
  ) => void;
  getSeriesHref?: (index: number) => string | undefined;
  onToggleSeriesVisibility?: (event: React.MouseEvent, index: number) => void;
}

const LegendItemInner = ({
  item,
  size = "sm",
  index,
  isMuted,
  isReversed,
  onHoverChange,
  onSelectSeries,
  getSeriesHref,
  onToggleSeriesVisibility,
}: LegendItemProps) => {
  const { dotSize, dotGap, typography } = LEGEND_SIZES[size];
  const isLink = onSelectSeries !== undefined && getSeriesHref !== undefined;
  // Building the URL is expensive, so it waits until the title is hovered or
  // focused.
  const [seriesHref, setSeriesHref] = useState<SeriesHref>({
    status: "pending",
  });
  const href = match(seriesHref)
    .with({ status: "pending" }, () => HREF_PLACEHOLDER)
    .with(
      { status: "resolved" },
      ({ href }) => href && Urls.getSubpathSafeUrl(href),
    )
    .exhaustive();

  const handleDotClick = (event: React.MouseEvent) => {
    onToggleSeriesVisibility?.(event, index);
  };

  const handleItemClick = (event: React.MouseEvent) => {
    onSelectSeries?.(event, index, isReversed);
  };

  // Navigate in-app through onSelectSeries, so the app doesn't reload and the
  // query builder can link back to the dashboard. The href serves middle-click
  // and "Open in new tab".
  const handleLinkClick = (event: React.MouseEvent) => {
    event.preventDefault();
    handleItemClick(event);
  };

  const handleUpdateHref = () => {
    setSeriesHref({ status: "resolved", href: getSeriesHref?.(index) });
  };

  const handleItemMouseEnter = (event: React.MouseEvent) => {
    onHoverChange?.({ index: index, element: event.currentTarget });
  };

  const handleItemMouseLeave = () => {
    onHoverChange?.();
  };

  return (
    <Flex align="center" miw={0} data-testid="legend-item">
      <Flex
        className={cx(S.itemLabel, {
          [S.hoverableLabel]: onHoverChange != null,
        })}
        align="center"
        w="100%"
        opacity={isMuted ? 0.4 : 1}
        onMouseEnter={onHoverChange && handleItemMouseEnter}
        onMouseLeave={onHoverChange && handleItemMouseLeave}
      >
        <LegendItemDot
          color={item.color}
          size={rem(dotSize)}
          isVisible={item.visible ?? true}
          onClick={onToggleSeriesVisibility && handleDotClick}
        />
        <Box
          component={isLink ? "a" : "div"} // not Metabase's <Link>: it swaps elements when the href resolves, losing focus
          href={isLink ? href : undefined}
          className={cx(DashboardS.fullscreenNormalText, S.itemTitle, {
            [S.clickableTitle]: onSelectSeries != null,
          })}
          display="block"
          fz={typography}
          lh={typography}
          ml={dotGap}
          miw={0}
          onClick={isLink ? handleLinkClick : onSelectSeries && handleItemClick}
          onFocus={isLink ? handleUpdateHref : undefined}
          onMouseEnter={isLink ? handleUpdateHref : undefined}
        >
          <Ellipsified>{item.name}</Ellipsified>
        </Box>
      </Flex>
    </Flex>
  );
};

export const LegendItem = memo(LegendItemInner);

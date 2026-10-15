import { Children, type ReactNode, useState } from "react";

import { useTranslateContent } from "metabase/content-translation/hooks";
import { Stack, Tooltip } from "metabase/ui";
import { getRootFontScale } from "metabase/visualizations/lib/scalar_utils";
import type {
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types";

import { ScalarActionButtons } from "./ScalarActionButtons";
import { ScalarTitle } from "./ScalarTitle";
import { ScalarWrapper } from "./ScalarValue";
import { type ScalarSizeTier, getScalarSizeTier } from "./sizing";

const TITLE_TOOLTIP_OFFSET = 1;

type ScalarCardProps = VisualizationProps & VisualizationPassThroughProps;

interface UseScalarCardShellOptions {
  hideTitle?: boolean;
}

export function useScalarCardShell(
  {
    settings,
    width,
    showTitle,
    height,
    getHref,
    onChangeCardAndRun,
    isVisualizerCard,
    visualizerRawSeries,
    titleMenuItems,
    headerIcon,
    rawSeries,
    isDashboard,
    isEditing,
  }: ScalarCardProps,
  { hideTitle = false }: UseScalarCardShellOptions = {},
) {
  const [isInnerTooltipHovered, setIsInnerTooltipHovered] = useState(false);
  const innerTooltipHoverHandlers = {
    onMouseEnter: () => setIsInnerTooltipHovered(true),
    onMouseLeave: () => setIsInnerTooltipHovered(false),
  };

  const tier = getScalarSizeTier(width, height);
  const rootFontScale = getRootFontScale();
  const availableWidth = Math.max(width - 2 * tier.xPadding * rootFontScale, 0);

  const tc = useTranslateContent();
  const title = showTitle && !hideTitle ? tc(settings["card.title"]) : null;
  const showsInlineTitle = Boolean(title) && tier.showsTitle;
  const showsTitleOnHover = Boolean(title) && !tier.showsTitle;
  const description =
    isDashboard && isEditing ? null : settings["card.description"];

  const canSelectTitle =
    onChangeCardAndRun != null &&
    (!isVisualizerCard || Children.count(titleMenuItems) === 1);
  const handleSelectTitle = () =>
    onChangeCardAndRun?.({
      nextCard: (visualizerRawSeries ?? rawSeries)[0].card,
    });

  const showsTitleTooltip = showsTitleOnHover && !isInnerTooltipHovered;

  const titleElement = showsInlineTitle ? (
    <ScalarTitle
      description={description}
      icon={headerIcon}
      getHref={canSelectTitle ? getHref : undefined}
      onSelectTitle={canSelectTitle ? handleSelectTitle : undefined}
    >
      {title}
    </ScalarTitle>
  ) : null;

  return {
    tier,
    rootFontScale,
    availableWidth,
    title,
    titleElement,
    showsTitleTooltip,
    innerTooltipHoverHandlers,
  };
}

interface ScalarCardShellProps {
  tier: ScalarSizeTier;
  title: ReactNode;
  showsTitleTooltip: boolean;
  actionButtons: ReactNode;
  innerTooltipHoverHandlers: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
  children: ReactNode;
}

export function ScalarCardShell({
  tier,
  title,
  showsTitleTooltip,
  actionButtons,
  innerTooltipHoverHandlers,
  children,
}: ScalarCardShellProps) {
  return (
    <Tooltip
      label={title}
      disabled={!showsTitleTooltip}
      position="top"
      offset={TITLE_TOOLTIP_OFFSET}
    >
      <ScalarWrapper xPadding={tier.xPadding}>
        <ScalarActionButtons tier={tier} {...innerTooltipHoverHandlers}>
          {actionButtons}
        </ScalarActionButtons>
        <Stack
          pos="relative"
          align="center"
          gap={tier.valueTitleGap}
          maw="100%"
          data-testid="scalar-content"
        >
          {children}
        </Stack>
      </ScalarWrapper>
    </Tooltip>
  );
}

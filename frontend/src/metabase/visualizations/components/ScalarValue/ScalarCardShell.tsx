import { Children, type ReactNode } from "react";

import { useTranslateContent } from "metabase/content-translation/hooks";
import { Center, Stack } from "metabase/ui";
import { getRootFontScale } from "metabase/visualizations/lib/scalar_utils";
import type {
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types";

import { ScalarActionButtons } from "./ScalarActionButtons";
import { ScalarTitle } from "./ScalarTitle";
import { ScalarWrapper } from "./ScalarValue";
import { type ScalarSizeTier, getScalarSizeTier } from "./sizing";

type ScalarCardProps = VisualizationProps & VisualizationPassThroughProps;

interface UseScalarCardShellOptions {
  hideTitle?: boolean;
  shouldHideDescription?: (tier: ScalarSizeTier) => boolean;
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
  { hideTitle = false, shouldHideDescription }: UseScalarCardShellOptions = {},
) {
  const tier = getScalarSizeTier(width, height);
  const rootFontScale = getRootFontScale();
  const availableWidth = Math.max(width - 2 * tier.xPadding * rootFontScale, 0);

  const tc = useTranslateContent();
  const title = showTitle && !hideTitle ? tc(settings["card.title"]) : null;
  const description =
    shouldHideDescription?.(tier) || (isDashboard && isEditing)
      ? null
      : settings["card.description"];

  const canSelectTitle =
    onChangeCardAndRun != null &&
    (!isVisualizerCard || Children.count(titleMenuItems) === 1);
  const handleSelectTitle = () =>
    onChangeCardAndRun?.({
      nextCard: (visualizerRawSeries ?? rawSeries)[0].card,
    });

  const titleElement = title ? (
    <ScalarTitle
      size={tier.size < 200 ? "sm" : "md"}
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
    titleElement,
    description: title ? description : null,
  };
}

interface ScalarCardShellProps {
  tier: ScalarSizeTier;
  actionButtons: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function ScalarCardShell({
  tier,
  actionButtons,
  children,
  footer,
}: ScalarCardShellProps) {
  return (
    <ScalarWrapper xPadding={tier.xPadding}>
      <ScalarActionButtons tier={tier}>{actionButtons}</ScalarActionButtons>
      <Stack
        pos="relative"
        align="center"
        gap={tier.valueTitleGap}
        w="100%"
        data-testid="scalar-content"
      >
        {children}
        {/* Keep the footer out of flow so it cannot shift the centered content. */}
        {footer && (
          <Center pos="absolute" top="100%" mt={2} w="100%">
            {footer}
          </Center>
        )}
      </Stack>
    </ScalarWrapper>
  );
}

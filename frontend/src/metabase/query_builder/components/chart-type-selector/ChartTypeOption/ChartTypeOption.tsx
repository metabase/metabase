import cx from "classnames";
import { t } from "ttag";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import {
  ActionIcon,
  Badge,
  Center,
  Icon,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import { visualizations } from "metabase/viz-core";
import type { VisualizationDisplay } from "metabase-types/api";

import ChartTypeOptionS from "./ChartTypeOption.module.css";

export type ChartTypeOptionProps = {
  onSelectVisualization: (display: VisualizationDisplay) => void;
  visualizationType: VisualizationDisplay;
  selectedVisualization: VisualizationDisplay;
  onOpenSettings?: () => void;
  /** Jev's fit score (0..1) for this chart on the current data; undefined when no suggestion yet. */
  recommendationScore?: number;
  /** Whether this type is in Jev's highlighted (top-ranked) set. */
  isRecommended?: boolean;
};

export const ChartTypeOption = ({
  visualizationType,
  selectedVisualization,
  onSelectVisualization,
  onOpenSettings,
  recommendationScore,
  isRecommended,
}: ChartTypeOptionProps) => {
  const visualization = visualizations.get(visualizationType);
  const isSelected = selectedVisualization === visualizationType;
  const scorePercent =
    recommendationScore != null ? Math.round(recommendationScore * 100) : null;

  // Once suggestions have loaded (a score exists), non-recommended charts dim so the eye lands on
  // the good ones. Recommended charts get a brand ring whose strength scales with the fit score.
  const hasSuggestions = recommendationScore != null;
  const isDimmed = hasSuggestions && !isRecommended && !isSelected;

  const displayName = visualization?.getUiName() ?? visualizationType;
  const iconName = visualization?.iconName;
  const hasCustomIcon = !!visualization?.iconUrl;

  const optionBody = (
    <Center pos="relative" data-testid="chart-type-option">
      <Stack
        align="center"
        gap="xxs"
        role="option"
        aria-selected={isSelected}
        className={cx({
          [ChartTypeOptionS.Dimmed]: isDimmed,
        })}
        data-testid={`${displayName}-container`}
      >
        <ActionIcon
          w="3.125rem"
          h="3.125rem"
          radius="50%"
          onClick={() => {
            if (isSelected) {
              onOpenSettings?.();
            } else {
              onSelectVisualization(visualizationType);
            }
          }}
          color="core-brand"
          data-is-selected={isSelected}
          variant={isSelected ? "filled" : "outline"}
          className={cx(
            ChartTypeOptionS.BorderedButton,
            ChartTypeOptionS.VisualizationButton,
            { [ChartTypeOptionS.RecommendedButton]: isRecommended && !isSelected },
          )}
          data-testid={`${displayName}-button`}
        >
          <EntityIcon
            name={iconName ?? "unknown"}
            iconUrl={visualization?.iconUrl}
            alt={displayName}
            color={isSelected ? "core-white" : "core-brand"}
            size={20}
            style={
              hasCustomIcon && isSelected
                ? { filter: "brightness(0) invert(1)" }
                : undefined
            }
          />
        </ActionIcon>

        {isSelected && onOpenSettings && (
          <ActionIcon
            pos="absolute"
            top="-0.5rem"
            right="-0.6rem"
            radius="xl"
            color="text-disabled"
            variant="viewHeader"
            bg="background_page-primary"
            className={cx(
              ChartTypeOptionS.BorderedButton,
              ChartTypeOptionS.SettingsButton,
            )}
            onClick={() => onOpenSettings?.()}
          >
            <Icon name="gear" size={16} />
          </ActionIcon>
        )}

        <Text
          lh="unset"
          ta="center"
          fw="bold"
          fz="sm"
          color={isSelected ? "core-brand" : "text-secondary"}
          data-testid="chart-type-option-label"
        >
          {displayName}
        </Text>

        {visualization?.isDev && (
          <Tooltip
            label={t`This is a development version of the visualization`}
          >
            <Badge
              color="brand"
              size="sm"
              variant="outline"
              aria-label={t`This is a development version of the visualization`}
            >{t`Dev`}</Badge>
          </Tooltip>
        )}
      </Stack>
    </Center>
  );

  // Precision lives on hover, not on the icon: recommended charts explain their score in a tooltip.
  if (isRecommended && scorePercent != null) {
    return (
      <Tooltip label={t`Jev suggests this chart — ${scorePercent}% fit for your data`}>
        {optionBody}
      </Tooltip>
    );
  }

  return optionBody;
};

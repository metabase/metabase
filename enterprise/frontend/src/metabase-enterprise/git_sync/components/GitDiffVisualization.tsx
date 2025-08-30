import { t } from "ttag";

import { Center, Loader, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";

import {
  type GitDiffCard,
  useGitDiffCardData,
} from "../hooks/useGitDiffCardData";

interface GitDiffVisualizationProps {
  card: GitDiffCard;
  height?: string | number;
}

export function GitDiffVisualization({
  card,
  height = "400px",
}: GitDiffVisualizationProps) {
  const { series, isLoading, error, metadata, hasData } =
    useGitDiffCardData(card);

  if (isLoading) {
    return (
      <Center h={height}>
        <Loader size="md" />
      </Center>
    );
  }

  if (error) {
    return (
      <Center h={height}>
        <Text c="text-medium" size="sm">
          {t`Failed to load visualization`}
        </Text>
      </Center>
    );
  }

  // If we have data, render the full visualization
  if (series && hasData) {
    return (
      <Visualization rawSeries={series} metadata={metadata} height={height} />
    );
  }

  // Render a placeholder if no data is available
  const placeholderCard = {
    ...card,
    display: card.display || "table",
    visualization_settings: card.visualization_settings || {},
  };

  return (
    <Visualization
      rawSeries={[
        {
          card: placeholderCard,
          data: null,
        },
      ]}
      metadata={metadata}
      isPlaceholder
      height={height}
    />
  );
}

import cx from "classnames";
import type { ReactNode } from "react";

import { SmallGenericError } from "metabase/components/ErrorPages";
import CS from "metabase/css/core/index.css";
import { getCardKey } from "metabase/visualizations/lib/utils";
import type {
  VisualizationProps as VisualizationPropsType,
  Visualization as VisualizationType,
} from "metabase/visualizations/types";
import type { DatasetData } from "metabase-types/api";

import { ErrorView } from "./ErrorView";
import LoadingView from "./LoadingView";
import NoResultsView from "./NoResultsView";
import type { VisualizationProps, VisualizationState } from "./types";

type VisualizationContentProps = {
  series: VisualizationState["series"];
  error: ReactNode;
  genericError: VisualizationState["genericError"];
  loading: boolean;
  noResults: boolean;
  replacementContent: JSX.Element | null | undefined;
  expectedDuration: number | undefined;
  isSlow: VisualizationProps["isSlow"];
  isDashboard: boolean | undefined;
  small: boolean;
  errorMessageOverride: string | undefined;
  errorIcon: VisualizationProps["errorIcon"];
  visualizationProps: Omit<
    VisualizationPropsType,
    "data" | "width" | "height"
  > & {
    data: DatasetData | undefined;
    width: number | null | undefined;
    height: number | null | undefined;
  };
  clicked: VisualizationState["clicked"];
  hovered: VisualizationState["hovered"];
  settings: Record<string, string>;
  handleVisualizationClick: (clicked: any) => void;
  handleHoverChange: (hovered: any) => void;
  visualization: VisualizationState["visualization"];
  isPlaceholder: boolean;
};

export function VisualizationContent({
  series,
  error,
  genericError,
  loading,
  noResults,
  replacementContent,
  expectedDuration,
  isSlow,
  isDashboard,
  small,
  errorMessageOverride,
  errorIcon,
  visualizationProps,
  clicked,
  hovered,
  settings,
  handleVisualizationClick,
  handleHoverChange,
  visualization,
  isPlaceholder,
}: VisualizationContentProps) {
  if (replacementContent) {
    return replacementContent;
  }

  if (isDashboard && noResults) {
    return <NoResultsView isSmall={small} />;
  }

  if (error) {
    return (
      <ErrorView
        error={errorMessageOverride ?? error}
        icon={errorIcon}
        isSmall={small}
        isDashboard={!!isDashboard}
      />
    );
  }

  if (genericError) {
    return <SmallGenericError bordered={false} />;
  }

  if (loading) {
    return (
      <LoadingView expectedDuration={expectedDuration} isSlow={!!isSlow} />
    );
  }

  if (!series || !visualization) {
    return null;
  }

  const CardVisualization = visualization as VisualizationType;

  return (
    <div
      data-card-key={getCardKey(series[0].card?.id)}
      className={cx(CS.flex, CS.flexColumn, CS.flexFull)}
    >
      <CardVisualization
        {...visualizationProps}
        card={series[0].card} // convenience for single-series visualizations
        clicked={clicked}
        data={series[0].data} // convenience for single-series visualizations
        hovered={hovered}
        series={series}
        settings={settings}
        onHoverChange={handleHoverChange}
        onVisualizationClick={handleVisualizationClick}
        isPlaceholder={isPlaceholder}
      />
    </div>
  );
}

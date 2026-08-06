import cx from "classnames";
import React from "react";

import CS from "metabase/css/core/index.css";
import ChartCaption from "metabase/visualizations/components/ChartCaption";
import { TransformedVisualization } from "metabase/visualizations/components/TransformedVisualization";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import { groupRawSeriesMetrics } from "metabase/visualizations/lib/dataset";
import type { VisualizationProps } from "metabase/visualizations/types";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";
import { funnelToBarTransform } from "metabase/visualizations/visualizations/Funnel/funnel-bar-transform";

import { FunnelNormal } from "../../components/FunnelNormal";

import { FUNNEL_CHART_DEFINITION } from "./definition";

function FunnelComponent(props: VisualizationProps) {
  const {
    headerIcon,
    settings,
    showTitle,
    isVisualizerCard,
    actionButtons,
    className,
    onChangeCardAndRun,
    rawSeries,
    visualizerRawSeries,
    fontFamily,
    getHref,
    isDashboard,
    isEditing,
    titleMenuItems,
  } = props;
  const hasTitle = showTitle && settings["card.title"];

  const groupedRawSeries = groupRawSeriesMetrics(
    rawSeries,
    settings["funnel.dimension"],
  );

  const renderingContext = useBrowserRenderingContext({ fontFamily });

  if (settings["funnel.type"] === "bar") {
    return (
      <TransformedVisualization
        originalProps={{ ...props, rawSeries: groupedRawSeries }}
        VisualizationComponent={BarChart}
        transformSeries={funnelToBarTransform}
        renderingContext={renderingContext}
      />
    );
  }

  // We can't navigate a user to a particular card from a visualizer viz,
  // so title selection is disabled in this case
  const canSelectTitle =
    !!onChangeCardAndRun &&
    (!isVisualizerCard || React.Children.count(titleMenuItems) === 1);

  return (
    <div className={cx(className, CS.flex, CS.flexColumn, CS.p1)}>
      {hasTitle && (
        <ChartCaption
          series={groupedRawSeries}
          visualizerRawSeries={visualizerRawSeries}
          settings={settings}
          icon={headerIcon}
          getHref={canSelectTitle ? getHref : undefined}
          actionButtons={actionButtons}
          hasInfoTooltip={!isDashboard || !isEditing}
          onChangeCardAndRun={canSelectTitle ? onChangeCardAndRun : undefined}
          titleMenuItems={titleMenuItems}
        />
      )}
      <FunnelNormal
        {...props}
        rawSeries={groupedRawSeries}
        className={CS.flexFull}
      />
    </div>
  );
}

export const Funnel = Object.assign(FunnelComponent, FUNNEL_CHART_DEFINITION);

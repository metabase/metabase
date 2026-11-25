import { useCallback, useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/common/components/ErrorBoundary";
import { useDashboardContext } from "metabase/dashboard/context";
import { getDashcardData } from "metabase/dashboard/selectors";
import { useSelector } from "metabase/redux";
import {
  isQuestionDashCard,
  isVirtualDashCard,
} from "metabase/utils/dashboard";
import { BaseChartSettings } from "metabase/visualizations/components/ChartSettings/BaseChartSettings";
import {
  useChartSettingsState,
  useSettingsWidgets,
} from "metabase/visualizations/components/ChartSettings/hooks";
import {
  extendCardWithDashcardSettings,
  getVisualizationRaw,
  sanitizeDashcardSettings,
} from "metabase/viz-core";
import type {
  DashCardId,
  DashCardSeries,
  DashboardCard,
  Series,
  VisualizationSettings,
} from "metabase-types/api";
import {
  isDashCardDataSeries,
  isVisualizerDashboardCard,
} from "metabase-types/guards/dashboard";

import S from "./DashCardInspector.module.css";

interface DashCardInspectorSettingsProps {
  dashcard: DashboardCard;
}

/**
 * PROTOTYPE: the Settings tab of the inspector. It shows the visualization
 * settings of the card and applies every change to the card right away.
 */
export function DashCardInspectorSettings({
  dashcard,
}: DashCardInspectorSettingsProps) {
  const dashcardData = useSelector((state) =>
    getDashcardData(state, dashcard.id),
  );

  // The same series the card itself renders: the card's own settings with
  // the dashboard card's overrides on top.
  const series: DashCardSeries = useMemo(() => {
    const mainCard = extendCardWithDashcardSettings(
      dashcard.card,
      dashcard.visualization_settings,
    );
    const cards =
      isQuestionDashCard(dashcard) && Array.isArray(dashcard.series)
        ? [mainCard, ...dashcard.series]
        : [mainCard];
    return cards.map((card) => ({
      ...(card.id ? dashcardData?.[card.id] : undefined),
      card,
      isSlow: false,
      isUsuallyFast: false,
    }));
  }, [dashcard, dashcardData]);

  if (isVisualizerDashboardCard(dashcard)) {
    return (
      <div className={S.message}>
        {t`This card was built with "Visualize another way". Its settings are not in the inspector yet.`}
      </div>
    );
  }

  if (isVirtualDashCard(dashcard)) {
    return (
      <ErrorBoundary>
        <SeriesSettings
          dashcardId={dashcard.id}
          // The settings code expects every series to have `data`, but text,
          // heading, link and iframe cards have none. The existing settings
          // modal (ChartSettingsButton) passes them the same way.
          series={series as Series}
        />
      </ErrorBoundary>
    );
  }

  if (!isDashCardDataSeries(series)) {
    return <div className={S.message}>{t`Loading the card's data…`}</div>;
  }

  return (
    <ErrorBoundary>
      <SeriesSettings dashcardId={dashcard.id} series={series} />
    </ErrorBoundary>
  );
}

interface SeriesSettingsProps {
  dashcardId: DashCardId;
  series: Series;
}

function SeriesSettings({ dashcardId, series }: SeriesSettingsProps) {
  const { dashboard, onReplaceAllDashCardVisualizationSettings } =
    useDashboardContext();

  const handleChange = useCallback(
    (settings: VisualizationSettings) => {
      // Like the settings modal: don't save settings that dashboards hide
      const settingDefinitions = getVisualizationRaw(series)?.settings ?? {};
      onReplaceAllDashCardVisualizationSettings(
        dashcardId,
        sanitizeDashcardSettings(settings, settingDefinitions),
      );
    },
    [dashcardId, series, onReplaceAllDashCardVisualizationSettings],
  );

  const { chartSettings, handleChangeSettings, transformedSeries } =
    useChartSettingsState({ series, onChange: handleChange });

  const extra = useMemo(
    () => ({ dashboardId: dashboard?.id }),
    [dashboard?.id],
  );

  const widgets = useSettingsWidgets({
    series,
    transformedSeries,
    handleChangeSettings,
    isDashboard: true,
    extra,
  });

  return (
    <BaseChartSettings
      className={S.settings}
      series={series}
      onChange={handleChange}
      chartSettings={chartSettings}
      widgets={widgets}
      transformedSeries={transformedSeries}
    />
  );
}

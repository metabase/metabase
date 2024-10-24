import { memo, useCallback, useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  onCloseChartSettings,
  onOpenChartType,
  onReplaceAllVisualizationSettings,
} from "metabase/query_builder/actions";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import {
  getUiControls,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import visualizations from "metabase/visualizations";
import { ChartSettings } from "metabase/visualizations/components/ChartSettings";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

interface ChartSettingsSidebarProps {
  question: Question;
  result: Dataset;
}

function ChartSettingsSidebarInner({
  question,
  result,
}: ChartSettingsSidebarProps) {
  const dispatch = useDispatch();

  const visualizationSettings = useSelector(getVisualizationSettings);
  const { initialChartSetting, showSidebarTitle = false } =
    useSelector(getUiControls);

  const sidebarContentProps = showSidebarTitle
    ? {
        title: t`${visualizations.get(question.display())?.uiName} options`,
        onBack: () => dispatch(onOpenChartType()),
      }
    : {};

  const handleClose = useCallback(() => {
    dispatch(onCloseChartSettings());
  }, [dispatch]);

  const card = question.card();
  const series = useMemo(() => {
    return [
      {
        ...result,
        card,
      },
    ];
  }, [card, result]);

  return (
    result && (
      <SidebarContent
        className={CS.fullHeight}
        onDone={handleClose}
        {...sidebarContentProps}
      >
        <ErrorBoundary>
          <ChartSettings
            question={question}
            series={series}
            onChange={(settings, question) =>
              dispatch(onReplaceAllVisualizationSettings(settings, question))
            }
            onClose={handleClose}
            noPreview
            initial={initialChartSetting}
            computedSettings={visualizationSettings}
          />
        </ErrorBoundary>
      </SidebarContent>
    )
  );
}

export const ChartSettingsSidebar = memo(ChartSettingsSidebarInner);

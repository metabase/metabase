import { memo, useCallback, useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import CS from "metabase/css/core/index.css";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import visualizations from "metabase/visualizations";
import {
  ChartSettings,
  type Widget,
} from "metabase/visualizations/components/ChartSettings";
import type Question from "metabase-lib/v1/Question";
import type { Dataset, VisualizationSettings } from "metabase-types/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getUiControls } from "metabase/query_builder/selectors";
import { onCloseChartSettings } from "metabase/query_builder/actions";

interface ChartSettingsSidebarProps {
  question: Question;
  result: Dataset;
  initialChartSetting: { section: string; widget?: Widget };
  onReplaceAllVisualizationSettings: (settings: VisualizationSettings) => void;
  onClose: () => void;
  onOpenChartType: () => void;
  visualizationSettings: VisualizationSettings;
  showSidebarTitle?: boolean;
}

function ChartSettingsSidebarInner({
  onClose,
  onOpenChartType,
  onReplaceAllVisualizationSettings,
  question,
  result,
  visualizationSettings,
}: ChartSettingsSidebarProps) {

  const dispatch = useDispatch()

  const { initialChartSetting, showSidebarTitle = false } = useSelector(getUiControls);

  const sidebarContentProps = showSidebarTitle
    ? {
        title: t`${visualizations.get(question.display())?.uiName} options`,
        onBack: () => onOpenChartType(),
      }
    : {};

  const handleClose = useCallback(() => {
    dispatch(onCloseChartSettings());
  }, [onClose]);

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
            onChange={onReplaceAllVisualizationSettings}
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

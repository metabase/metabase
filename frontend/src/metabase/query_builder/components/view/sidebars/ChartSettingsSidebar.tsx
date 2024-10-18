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

interface ChartSettingsSidebarProps {
  question: Question;
  result: Dataset;
  addField: () => void;
  initialChartSetting: { section: string; widget?: Widget };
  onReplaceAllVisualizationSettings: (settings: VisualizationSettings) => void;
  onClose: () => void;
  onOpenChartType: () => void;
  visualizationSettings: VisualizationSettings;
  showSidebarTitle?: boolean;
}

function ChartSettingsSidebarInner(props: ChartSettingsSidebarProps) {
  const {
    question,
    result,
    addField,
    initialChartSetting,
    onReplaceAllVisualizationSettings,
    onClose,
    onOpenChartType,
    visualizationSettings,
    showSidebarTitle = false,
  } = props;
  const sidebarContentProps = showSidebarTitle
    ? {
        title: t`${visualizations.get(question.display())?.uiName} options`,
        onBack: () => onOpenChartType(),
      }
    : {};

  const handleClose = useCallback(() => {
    onClose();
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
            addField={addField}
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

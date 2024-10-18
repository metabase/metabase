import { memo, useCallback, useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import CS from "metabase/css/core/index.css";
import { onOpenChartSettings, setUIControls, updateQuestion } from "metabase/query_builder/actions";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import visualizations from "metabase/visualizations";
import {
  ChartSettings,
  type Widget,
} from "metabase/visualizations/components/ChartSettings";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { CardDisplayType, Dataset, VisualizationSettings } from "metabase-types/api";

import { ChartTypeSettings, useChartTypeVisualizations } from "../../chart-type-selector";
import { useDispatch } from "metabase/lib/redux";


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
        card,
        data: result.data,
      },
    ];
  }, [card, result.data]);

  const dispatch = useDispatch();

  const onUpdateQuestion = (newQuestion: Question) => {
    if (question) {
      dispatch(
        updateQuestion(newQuestion, {
          shouldUpdateUrl: Lib.queryDisplayInfo(question.query()).isEditable,
        }),
      );
      dispatch(setUIControls({ isShowingRawTable: false }));
    }
  };

  const handleSelectVisualization = (display: CardDisplayType) => {
    updateQuestionVisualization(display);
  };

  const onOpenVizSettings = () => {
    dispatch(
      onOpenChartSettings({
        initialChartSettings: { section: t`Data` },
        showSidebarTitle: true,
      }),
    );
  };

  const {
    selectedVisualization,
    updateQuestionVisualization,
    sensibleVisualizations,
    nonSensibleVisualizations,
  } = useChartTypeVisualizations({
    question,
    result,
    onUpdateQuestion,
  });

  return (
    result && (
      <SidebarContent
        className={CS.fullHeight}
        onDone={handleClose}
        {...sidebarContentProps}
      >
        <ErrorBoundary>
          <ChartSettings
            chartTypeSettings={<ChartTypeSettings
              selectedVisualization={selectedVisualization}
              onSelectVisualization={handleSelectVisualization}
              sensibleVisualizations={sensibleVisualizations}
              nonSensibleVisualizations={nonSensibleVisualizations}
              onOpenSettings={onOpenVizSettings}
              spacing={0}
              w="100%"
              p="lg"
            />}
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

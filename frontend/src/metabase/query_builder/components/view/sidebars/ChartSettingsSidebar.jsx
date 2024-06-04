/* eslint-disable react/prop-types */
import { useMemo, useCallback, useState, memo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import CS from "metabase/css/core/index.css";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import visualizations from "metabase/visualizations";
import ChartSettings from "metabase/visualizations/components/ChartSettings";

function ChartSettingsSidebar(props) {
  const [sidebarPropsOverride, setSidebarPropsOverride] = useState(null);
  const handleSidebarPropsOverride = useCallback(
    sidebarPropsOverride => {
      setSidebarPropsOverride(sidebarPropsOverride);
    },
    [setSidebarPropsOverride],
  );

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
        title: t`${visualizations.get(question.display()).uiName} options`,
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

  return (
    result && (
      <SidebarContent
        className={CS.fullHeight}
        onDone={handleClose}
        {...sidebarContentProps}
        {...sidebarPropsOverride}
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
            setSidebarPropsOverride={handleSidebarPropsOverride}
            computedSettings={visualizationSettings}
          />
        </ErrorBoundary>
      </SidebarContent>
    )
  );
}

export default memo(ChartSettingsSidebar);

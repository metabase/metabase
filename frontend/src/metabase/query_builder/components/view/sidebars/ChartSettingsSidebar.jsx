import React from "react";
import { t } from "ttag";

import ChartSettings from "metabase/visualizations/components/ChartSettings";
import visualizations from "metabase/visualizations";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

const ChartSettingsSidebar = ({
  question,
  result,
  addField,
  initialChartSetting,
  onReplaceAllVisualizationSettings,
  onClose,
  onOpenChartType,
  ...props
}) =>
  result && (
    <SidebarContent
      className="full-height"
      title={t`${visualizations.get(question.display()).uiName} options`}
      onDone={onClose}
      onBack={onOpenChartType}
    >
      <ChartSettings
        question={question}
        addField={addField}
        series={[
          {
            card: question.card(),
            data: result.data,
          },
        ]}
        onChange={onReplaceAllVisualizationSettings}
        onClose={onClose}
        noPreview
        initial={initialChartSetting}
      />
    </SidebarContent>
  );

export default ChartSettingsSidebar;

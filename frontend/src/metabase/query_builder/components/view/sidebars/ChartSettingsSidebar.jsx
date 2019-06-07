import React from "react";
import { t } from "ttag";
import Button from "metabase/components/Button";

import ChartSettings from "metabase/visualizations/components/ChartSettings";
import visualizations, {
  getIconForVisualizationType,
} from "metabase/visualizations";
import Icon from "metabase/components/Icon";
import SidebarContent from "../SidebarContent";

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
      onClose={onClose}
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

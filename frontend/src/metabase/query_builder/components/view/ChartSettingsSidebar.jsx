import React from "react";
import { t } from "c-3po";
import Button from "metabase/components/Button";

import ChartSettings from "metabase/visualizations/components/ChartSettings";

const ChartSettingsSidebar = ({
  question,
  result,
  addField,
  initialChartSetting,
  onReplaceAllVisualizationSettings,
  onClose,
  ...props
}) =>
  result && (
    <div className="full-height">
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
      <Button
        medium
        primary
        onClick={onClose}
        className="ml4 mb3"
      >
        {t`Done`}
      </Button>
    </div>
  );

export default ChartSettingsSidebar;

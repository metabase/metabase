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
    <div className="flex">
        <Button
          medium
          primary
          onClick={onClose}
          className="mx4 mb3 flex-full"
        >
          {t`Done`}
        </Button>
      </div>
    </div>
  );

export default ChartSettingsSidebar;

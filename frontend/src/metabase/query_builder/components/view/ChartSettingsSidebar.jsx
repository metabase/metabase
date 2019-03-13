import React from "react";

import ChartSettings from "metabase/visualizations/components/ChartSettings";

const ChartSettingsSidebar = ({
  question,
  result,
  addField,
  onReplaceAllVisualizationSettings,
  onClose,
  ...props
}) => (
  <div>
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
    />
  </div>
);

export default ChartSettingsSidebar;

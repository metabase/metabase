import React from "react";
import { t } from "c-3po";
import Button from "metabase/components/Button";

import ChartSettings from "metabase/visualizations/components/ChartSettings";

const ChartSettingsSidebar = ({
  question,
  result,
  addField,
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
      />
      <Button
        medium
        primary
        onClick={onClose}
        className="absolute bottom right"
        m={1}
      >
        {t`Done`}
      </Button>
    </div>
  );

export default ChartSettingsSidebar;

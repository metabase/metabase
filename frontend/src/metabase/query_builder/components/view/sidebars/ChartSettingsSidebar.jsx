import React from "react";
import { t } from "ttag";
import Button from "metabase/components/Button";

import ChartSettings from "metabase/visualizations/components/ChartSettings";
import visualizations, {
  getIconForVisualizationType,
} from "metabase/visualizations";
import Icon from "metabase/components/Icon";

const ChartSettingsSidebar = ({
  question,
  result,
  addField,
  initialChartSetting,
  onReplaceAllVisualizationSettings,
  onClose,
  setUIControls,
  ...props
}) =>
  result && (
    <div className="full-height">
      <div className="flex align-center px4 py2 mb1 bg-brand text-white">
        <div
          className="flex align-center cursor-pointer"
          onClick={() =>
            setUIControls({
              isShowingChartSettingsSidebar: false,
              isShowingChartTypeSidebar: true,
            })
          }
        >
          <Icon name="chevronleft" />
          <h3 className="text-heavy ml1">
            {visualizations.get(question.display()).uiName} {t`options`}
          </h3>
        </div>
        <Button
          white
          className="flex-align-right"
          onClick={onClose}
        >
          {t`Done`}
        </Button>
      </div>
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
    </div>
  );

export default ChartSettingsSidebar;

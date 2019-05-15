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
    <div className="flex flex-column full-height justify-between">
      <div className="scroll-y">
        <div className="flex px4 py3 mb1 bg-medium">
          <div
            className="flex align-center cursor-pointer text-brand-hover"
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
      <Button
        primary
        className="m2 text-centered"
        onClick={onClose}
      >
        {t`Done`}
      </Button>
    </div>
  );

export default ChartSettingsSidebar;

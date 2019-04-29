import React from "react";
import { t } from "c-3po";
import Button from "metabase/components/Button";

import ChartSettings from "metabase/visualizations/components/ChartSettings";
import visualizations, {getIconForVisualizationType} from "metabase/visualizations";
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
      <div
        className="mx4 flex align-center mt3 mb1 text-brand-hover cursor-pointer"
        onClick={
          () => setUIControls ({
            isShowingChartSettingsSidebar: false,
            isShowingChartTypeSidebar: true,
          })
        }
      >
        <Icon name="chevronleft" className="text-medium" />
        <Icon
            name={getIconForVisualizationType(question.display())}
            className="ml2 mr1"
        />
        <h3 className="text-heavy">{visualizations.get(question.display()).uiName} {t`options`}</h3>
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

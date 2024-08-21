import cx from "classnames";

import ButtonBar from "metabase/components/ButtonBar";
import CS from "metabase/css/core/index.css";
import {
  CenterViewFooterButtonGroup,
  type CenterViewFooterButtonGroupProps,
} from "metabase/query_builder/components/view/ViewFooter/CenterViewFooterButtonGroup";
import {
  LeftViewFooterButtonGroup,
  type LeftViewFooterButtonGroupProps,
} from "metabase/query_builder/components/view/ViewFooter/LeftViewFooterButtonGroup";
import {
  RightViewFooterButtonGroup,
  type RightViewFooterButtonGroupProps,
} from "metabase/query_builder/components/view/ViewFooter/RightViewFooterButtonGroup";
import * as Lib from "metabase-lib";

import { ViewFooterRoot } from "../ViewFooter.styled";

type ViewFooterProps = LeftViewFooterButtonGroupProps &
  CenterViewFooterButtonGroupProps &
  RightViewFooterButtonGroupProps & {
    className?: string;
  };

export const ViewFooter = ({
  question,
  result,
  className,
  isShowingChartTypeSidebar,
  isShowingChartSettingsSidebar,
  isShowingRawTable,
  onOpenChartType,
  onOpenModal,
  onCloseChartType,
  onOpenChartSettings,
  onCloseChartSettings,
  setUIControls,
  isObjectDetail,
  questionAlerts,
  visualizationSettings,
  canManageSubscriptions,
  isVisualized,
  isTimeseries,
  isShowingTimelineSidebar,
  onOpenTimelines,
  onCloseTimelines,
}: ViewFooterProps) => {
  if (!result) {
    return null;
  }

  const { isEditable } = Lib.queryDisplayInfo(question.query());
  const hideChartSettings =
    (result.error && !isEditable) || question.isArchived();
  const type = question.type();

  return (
    <ViewFooterRoot
      className={cx(className, CS.textMedium, CS.borderTop)}
      data-testid="view-footer"
    >
      <ButtonBar
        className={CS.flexFull}
        left={
          !hideChartSettings && (
            <LeftViewFooterButtonGroup
              isShowingChartTypeSidebar={isShowingChartTypeSidebar}
              isShowingChartSettingsSidebar={isShowingChartSettingsSidebar}
              onCloseChartType={onCloseChartType}
              onOpenChartType={onOpenChartType}
              onCloseChartSettings={onCloseChartSettings}
              onOpenChartSettings={onOpenChartSettings}
            />
          )
        }
        center={
          <CenterViewFooterButtonGroup
            isVisualized={isVisualized}
            setUIControls={setUIControls}
            question={question}
            isShowingRawTable={isShowingRawTable}
          />
        }
        right={
          <RightViewFooterButtonGroup
            result={result}
            isObjectDetail={isObjectDetail}
            question={question}
            visualizationSettings={visualizationSettings}
            canManageSubscriptions={canManageSubscriptions}
            questionAlerts={questionAlerts}
            onOpenModal={onOpenModal}
            type={type}
            isTimeseries={isTimeseries}
            isShowingTimelineSidebar={isShowingTimelineSidebar}
            onOpenTimelines={onOpenTimelines}
            onCloseTimelines={onCloseTimelines}
          />
        }
      />
    </ViewFooterRoot>
  );
};

import cx from "classnames";

import ButtonBar from "metabase/components/ButtonBar";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getIsVisualized } from "metabase/query_builder/selectors";
import * as Lib from "metabase-lib";

import { ViewFooterRoot } from "../ViewFooter.styled";

import {
  CenterViewFooterButtonGroup,
  type CenterViewFooterButtonGroupProps,
} from "./CenterViewFooterButtonGroup";
import {
  LeftViewFooterButtonGroup,
  type LeftViewFooterButtonGroupProps,
} from "./LeftViewFooterButtonGroup";
import {
  RightViewFooterButtonGroup,
  type RightViewFooterButtonGroupProps,
} from "./RightViewFooterButtonGroup";

type ViewFooterProps = LeftViewFooterButtonGroupProps &
  CenterViewFooterButtonGroupProps &
  RightViewFooterButtonGroupProps;

export const ViewFooter = ({
  question,
  result,
  className,
  isShowingChartTypeSidebar,
  isShowingChartSettingsSidebar,
  isShowingRawTable,
  onOpenChartType,
  onCloseChartType,
  onOpenChartSettings,
  onCloseChartSettings,
  setUIControls,
  isObjectDetail,
  isTimeseries,
  visualizationSettings,
  isShowingTimelineSidebar,
  onOpenTimelines,
  onCloseTimelines,
}: ViewFooterProps) => {
  const isVisualized = useSelector(getIsVisualized);

  if (!result) {
    return null;
  }

  const { isEditable } = Lib.queryDisplayInfo(question.query());
  const hideChartSettings =
    (result.error && !isEditable) || question.isArchived();

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
          isVisualized && (
            <CenterViewFooterButtonGroup
              setUIControls={setUIControls}
              question={question}
              isShowingRawTable={isShowingRawTable}
            />
          )
        }
        right={
          <RightViewFooterButtonGroup
            question={question}
            result={result}
            isObjectDetail={isObjectDetail}
            isTimeseries={isTimeseries}
            visualizationSettings={visualizationSettings}
            isShowingTimelineSidebar={isShowingTimelineSidebar}
            onOpenTimelines={onOpenTimelines}
            onCloseTimelines={onCloseTimelines}
          />
        }
      />
    </ViewFooterRoot>
  );
};

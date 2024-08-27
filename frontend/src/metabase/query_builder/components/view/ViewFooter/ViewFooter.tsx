import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getIsVisualized } from "metabase/query_builder/selectors";
import { Group } from "metabase/ui";
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
      className={cx(className, CS.textMedium, CS.borderTop, CS.fullWidth)}
      data-testid="view-footer"
    >
      <Group position="apart" pos="relative" noWrap w="100%">
        <Group className={CS.flex1}>
          {!hideChartSettings && (
            <LeftViewFooterButtonGroup
              isShowingChartTypeSidebar={isShowingChartTypeSidebar}
              isShowingChartSettingsSidebar={isShowingChartSettingsSidebar}
              onCloseChartType={onCloseChartType}
              onOpenChartType={onOpenChartType}
              onCloseChartSettings={onCloseChartSettings}
              onOpenChartSettings={onOpenChartSettings}
            />
          )}
        </Group>
        {isVisualized && (
          <Group>
            <CenterViewFooterButtonGroup
              setUIControls={setUIControls}
              question={question}
              isShowingRawTable={isShowingRawTable}
            />
          </Group>
        )}
        <Group noWrap>
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
        </Group>
      </Group>
    </ViewFooterRoot>
  );
};

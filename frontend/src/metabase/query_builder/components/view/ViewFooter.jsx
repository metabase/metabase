/* eslint-disable react/prop-types */
import cx from "classnames";
import { t } from "ttag";

import ButtonBar from "metabase/components/ButtonBar";
import { EmbedMenu } from "metabase/dashboard/components/EmbedMenu";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import * as Lib from "metabase-lib";

import QuestionAlertWidget from "./QuestionAlertWidget";
import QuestionDisplayToggle from "./QuestionDisplayToggle";
import QuestionLastUpdated from "./QuestionLastUpdated";
import QuestionRowCount from "./QuestionRowCount";
import QuestionTimelineWidget from "./QuestionTimelineWidget";
import ViewButton from "./ViewButton";
import { ViewFooterRoot, FooterButtonGroup } from "./ViewFooter.styled";

const ViewFooter = ({
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
}) => {
  if (!result) {
    return null;
  }

  const { isEditable } = Lib.queryDisplayInfo(question.query());
  const hasDataPermission = isEditable;
  const hideChartSettings = result.error && !hasDataPermission;
  const type = question.type();

  return (
    <ViewFooterRoot
      className={cx(className, "text-medium border-top")}
      data-testid="view-footer"
    >
      <ButtonBar
        className="flex-full"
        left={[
          !hideChartSettings && (
            <FooterButtonGroup>
              <ViewButton
                medium
                labelBreakpoint="sm"
                data-testid="viz-type-button"
                active={isShowingChartTypeSidebar}
                onClick={
                  isShowingChartTypeSidebar
                    ? () => onCloseChartType()
                    : () => onOpenChartType()
                }
              >
                {t`Visualization`}
              </ViewButton>
              <ViewButton
                active={isShowingChartSettingsSidebar}
                icon="gear"
                iconSize={16}
                medium
                onlyIcon
                labelBreakpoint="sm"
                data-testid="viz-settings-button"
                onClick={
                  isShowingChartSettingsSidebar
                    ? () => onCloseChartSettings()
                    : () => onOpenChartSettings()
                }
              />
            </FooterButtonGroup>
          ),
        ]}
        center={
          isVisualized && (
            <QuestionDisplayToggle
              key="viz-table-toggle"
              className="mx1"
              question={question}
              isShowingRawTable={isShowingRawTable}
              onToggleRawTable={isShowingRawTable => {
                setUIControls({ isShowingRawTable });
              }}
            />
          )
        }
        right={[
          QuestionRowCount.shouldRender({
            result,
            isObjectDetail,
          }) && <QuestionRowCount key="row_count" />,
          QuestionLastUpdated.shouldRender({ result }) && (
            <QuestionLastUpdated
              key="last-updated"
              className="hide sm-show"
              result={result}
            />
          ),
          QueryDownloadWidget.shouldRender({ result }) && (
            <QueryDownloadWidget
              key="download"
              className="hide sm-show"
              question={question}
              result={result}
              visualizationSettings={visualizationSettings}
              dashcardId={question.card().dashcardId}
              dashboardId={question.card().dashboardId}
            />
          ),
          QuestionAlertWidget.shouldRender({
            question,
            visualizationSettings,
          }) && (
            <QuestionAlertWidget
              key="alerts"
              className="hide sm-show"
              canManageSubscriptions={canManageSubscriptions}
              question={question}
              questionAlerts={questionAlerts}
              onCreateAlert={() =>
                question.isSaved()
                  ? onOpenModal("create-alert")
                  : onOpenModal("save-question-before-alert")
              }
            />
          ),
          type === "question" && (
            <EmbedMenu
              key="embed"
              resource={question}
              resourceType="question"
              hasPublicLink={!!question.publicUUID()}
              onModalOpen={() =>
                question.isSaved()
                  ? onOpenModal("embed")
                  : onOpenModal("save-question-before-embed")
              }
            />
          ),
          QuestionTimelineWidget.shouldRender({ isTimeseries }) && (
            <QuestionTimelineWidget
              key="timelines"
              className="hide sm-show"
              isShowingTimelineSidebar={isShowingTimelineSidebar}
              onOpenTimelines={onOpenTimelines}
              onCloseTimelines={onCloseTimelines}
            />
          ),
        ]}
      />
    </ViewFooterRoot>
  );
};

export default ViewFooter;

/* eslint-disable react/prop-types */
import cx from "classnames";
import { t } from "ttag";

import ButtonBar from "metabase/components/ButtonBar";
import CS from "metabase/css/core/index.css";
import { EmbedMenu } from "metabase/dashboard/components/EmbedMenu";
import { ResourceEmbedButton } from "metabase/public/components/ResourceEmbedButton";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import * as Lib from "metabase-lib";

import { ExecutionTime } from "./ExecutionTime";
import QuestionAlertWidget from "./QuestionAlertWidget";
import QuestionDisplayToggle from "./QuestionDisplayToggle";
import QuestionLastUpdated from "./QuestionLastUpdated";
import QuestionRowCount from "./QuestionRowCount";
import QuestionTimelineWidget from "./QuestionTimelineWidget";
import ViewButton from "./ViewButton";
import { FooterButtonGroup, ViewFooterRoot } from "./ViewFooter.styled";

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
  const hideChartSettings = result.error && !isEditable;
  const type = question.type();

  return (
    <ViewFooterRoot
      className={cx(className, CS.textMedium, CS.borderTop)}
      data-testid="view-footer"
    >
      <ButtonBar
        className={CS.flexFull}
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
              className={CS.mx1}
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
          <ExecutionTime key="execution_time" time={result.running_time} />,
          QuestionLastUpdated.shouldRender({ result }) && (
            <QuestionLastUpdated
              key="last-updated"
              className={cx(CS.hide, CS.smShow)}
              result={result}
            />
          ),
          QueryDownloadWidget.shouldRender({ result }) && (
            <QueryDownloadWidget
              key="download"
              className={cx(CS.hide, CS.smShow)}
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
              className={cx(CS.hide, CS.smShow)}
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
          type === "question" &&
            (question.isSaved() ? (
              <EmbedMenu
                key="embed"
                resource={question}
                resourceType="question"
                hasPublicLink={!!question.publicUUID()}
                onModalOpen={() => onOpenModal(MODAL_TYPES.EMBED)}
              />
            ) : (
              <ResourceEmbedButton
                hasBackground={false}
                onClick={() =>
                  onOpenModal(MODAL_TYPES.SAVE_QUESTION_BEFORE_EMBED)
                }
              />
            )),
          QuestionTimelineWidget.shouldRender({ isTimeseries }) && (
            <QuestionTimelineWidget
              key="timelines"
              className={cx(CS.hide, CS.smShow)}
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

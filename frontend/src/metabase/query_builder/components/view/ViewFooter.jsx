/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";
import cx from "classnames";
import styled from "@emotion/styled";
import { color, darken } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";

import ButtonBar from "metabase/components/ButtonBar";

import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import QuestionEmbedWidget, {
  QuestionEmbedWidgetTrigger,
} from "metabase/query_builder/containers/QuestionEmbedWidget";
import { getIconForVisualizationType } from "metabase/visualizations";
import ViewButton from "./ViewButton";

import QuestionAlertWidget from "./QuestionAlertWidget";
import QuestionTimelineWidget from "./QuestionTimelineWidget";

import QuestionRowCount from "./QuestionRowCount";
import QuestionLastUpdated from "./QuestionLastUpdated";
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
  isAdmin,
  canManageSubscriptions,
  isResultDirty,
  isVisualized,
  isTimeseries,
  isShowingTimelineSidebar,
  onOpenTimelines,
  onCloseTimelines,
}) => {
  if (!result) {
    return null;
  }

  const hasDataPermission = question.query().isEditable();
  const hideChartSettings = result.error && !hasDataPermission;

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
            <VizTableToggle
              key="viz-table-toggle"
              className="mx1"
              question={question}
              isShowingRawTable={isShowingRawTable}
              onShowTable={isShowingRawTable => {
                setUIControls({ isShowingRawTable });
              }}
            />
          )
        }
        right={[
          QuestionRowCount.shouldRender({
            question,
            result,
            isObjectDetail,
          }) && <QuestionRowCount key="row_count" className="mx1" />,
          QuestionLastUpdated.shouldRender({ result }) && (
            <QuestionLastUpdated
              key="last-updated"
              className="mx1 hide sm-show"
              result={result}
            />
          ),
          QueryDownloadWidget.shouldRender({ result, isResultDirty }) && (
            <QueryDownloadWidget
              key="download"
              className="mx1 hide sm-show"
              card={question.card()}
              result={result}
              visualizationSettings={visualizationSettings}
            />
          ),
          QuestionAlertWidget.shouldRender({
            question,
            visualizationSettings,
          }) && (
            <QuestionAlertWidget
              key="alerts"
              className="mx1 hide sm-show"
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
          QuestionEmbedWidget.shouldRender({ question, isAdmin }) && (
            <QuestionEmbedWidgetTrigger
              key="embeds"
              onClick={() =>
                question.isSaved()
                  ? onOpenModal("embed")
                  : onOpenModal("save-question-before-embed")
              }
            />
          ),
          QuestionTimelineWidget.shouldRender({ isTimeseries }) && (
            <QuestionTimelineWidget
              key="timelines"
              className="mx1 hide sm-show"
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

const Well = styled.div`
  display: flex;
  align-items: center;
  padding: 4px 6px;
  border-radius: 99px;
  background-color: ${color("bg-medium")};
  &:hover {
    background-color: ${darken(color("bg-medium"), 0.05)};
  }
  transition: background 300ms linear;
`;

const ToggleIcon = styled.div`
  display: flex;
  padding: 4px 8px;
  cursor: pointer;
  background-color: ${props => (props.active ? color("brand") : "transparent")};
  color: ${props => (props.active ? "white" : "inherit")};
  border-radius: 99px;
`;

const VizTableToggle = ({
  className,
  question,
  isShowingRawTable,
  onShowTable,
}) => {
  const vizIcon = getIconForVisualizationType(question.display());
  return (
    <Well className={className} onClick={() => onShowTable(!isShowingRawTable)}>
      <ToggleIcon active={isShowingRawTable} aria-label={t`Switch to data`}>
        <Icon name="table2" />
      </ToggleIcon>
      <ToggleIcon
        active={!isShowingRawTable}
        aria-label={t`Switch to visualization`}
      >
        <Icon name={vizIcon} />
      </ToggleIcon>
    </Well>
  );
};

export default ViewFooter;

import React from "react";

import { t } from "ttag";
import cx from "classnames";
import styled from "styled-components";
import { Flex } from "grid-styled";
import colors, { darken } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";

import ButtonBar from "metabase/components/ButtonBar";

import ViewSection from "./ViewSection";
import ViewButton from "./ViewButton";

import QuestionAlertWidget from "./QuestionAlertWidget";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import QuestionEmbedWidget from "metabase/query_builder/containers/QuestionEmbedWidget";

import QuestionRowCount from "./QuestionRowCount";
import QuestionLastUpdated from "./QuestionLastUpdated";

import {
  getVisualizationRaw,
  getIconForVisualizationType,
} from "metabase/visualizations";

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
  isPreviewing,
  isResultDirty,
  isVisualized,
}) => {
  if (!result || isObjectDetail) {
    return null;
  }

  return (
    <ViewSection className={cx(className, "text-medium border-top")} py={1}>
      <ButtonBar
        className="flex-full"
        left={[
          <VizTypeButton
            key="viz-type"
            question={question}
            result={result}
            active={isShowingChartTypeSidebar}
            onClick={
              isShowingChartTypeSidebar ? onCloseChartType : onOpenChartType
            }
          />,
          <VizSettingsButton
            key="viz-settings"
            ml={1}
            active={isShowingChartSettingsSidebar}
            onClick={
              isShowingChartSettingsSidebar
                ? onCloseChartSettings
                : onOpenChartSettings
            }
          />,
        ]}
        center={
          isVisualized && (
            <VizTableToggle
              key="viz-table-toggle"
              question={question}
              isShowingRawTable={isShowingRawTable}
              onShowTable={isShowingRawTable => {
                setUIControls({ isShowingRawTable });
              }}
            />
          )
        }
        right={[
          QuestionRowCount.shouldRender({ question, result, isObjectDetail }) &&
            !isPreviewing && (
              <QuestionRowCount
                key="row_count"
                className="mx1"
                question={question}
                isResultDirty={isResultDirty}
                result={result}
              />
            ),
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
            />
          ),
          QuestionAlertWidget.shouldRender({
            question,
            visualizationSettings,
          }) && (
            <QuestionAlertWidget
              key="alerts"
              className="mx1 hide sm-show"
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
            <QuestionEmbedWidget
              key="embed"
              className="mx1 hide sm-show"
              card={question.card()}
            />
          ),
        ]}
      />
    </ViewSection>
  );
};

const VizTypeButton = ({ question, result, ...props }) => {
  // TODO: move this to QuestionResult or something
  const { visualization } = getVisualizationRaw([
    { card: question.card(), data: result.data },
  ]);
  const icon = visualization && visualization.iconName;

  return (
    <ViewButton medium icon={icon} {...props}>
      {t`Visualization`}
    </ViewButton>
  );
};

const VizSettingsButton = ({ ...props }) => (
  <ViewButton medium icon="gear" {...props}>
    {t`Settings`}
  </ViewButton>
);

const Well = styled(Flex)`
  border-radius: 99px;
  &:hover {
    background-color: ${darken(colors["bg-medium"], 0.05)};
  }
  transition: background 300ms linear;
`;

Well.defaultProps = {
  px: "6px",
  py: "4px",
  align: "center",
  bg: colors["bg-medium"],
};

const ToggleIcon = styled(Flex)`
  cursor: pointer;
  background-color: ${props =>
    props.active ? colors["brand"] : "transparent"};
  color: ${props => (props.active ? "white" : "inherit")};
  border-radius: 99px;
`;

ToggleIcon.defaultProps = {
  p: "4px",
  px: "8px",
};

const VizTableToggle = ({ question, isShowingRawTable, onShowTable }) => {
  const vizIcon = getIconForVisualizationType(question.display());
  return (
    <Well onClick={() => onShowTable(!isShowingRawTable)}>
      <ToggleIcon active={isShowingRawTable}>
        <Icon name="table2" />
      </ToggleIcon>
      <ToggleIcon active={!isShowingRawTable}>
        <Icon name={vizIcon} />
      </ToggleIcon>
    </Well>
  );
};

export default ViewFooter;

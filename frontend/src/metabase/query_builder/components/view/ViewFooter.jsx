import React from "react";

import { t } from "ttag";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip.jsx";

import ViewSection from "./ViewSection";

import QuestionAlertWidget from "./QuestionAlertWidget";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import QuestionEmbedWidget from "metabase/query_builder/containers/QuestionEmbedWidget";
import QuestionRowCount from "./QuestionRowCount";

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
  isShowingTable,
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
}) => {
  if (!result || isObjectDetail) {
    return null;
  }

  return (
    <ViewSection
      className={cx(className, "flex align-center text-medium border-top")}
      trim
    >
      <div className="flex align-center">
        <VizTypeButton
          question={question}
          result={result}
          selected={isShowingChartTypeSidebar}
          onClick={
            isShowingChartTypeSidebar ? onCloseChartType : onOpenChartType
          }
        />
        <VizSettingsButton
          selected={isShowingChartSettingsSidebar}
          onClick={
            isShowingChartSettingsSidebar
              ? onCloseChartSettings
              : onOpenChartSettings
          }
        />
        {question.display() !== "scalar" && (
          <VizTableToggle
            question={question}
            isShowingTable={
              (isShowingTable || question.display() === "table") &&
              !isShowingChartTypeSidebar
            }
            onShowTable={isShowingTable => {
              if (question.display() === "table" && !isShowingTable) {
                onOpenChartType();
              } else {
                setUIControls({ isShowingTable });
              }
            }}
          />
        )}
      </div>
      <div className="ml-auto flex align-center">
        {QuestionRowCount.shouldRender({ question, result, isObjectDetail }) &&
          !isPreviewing && (
            <QuestionRowCount
              key="row_count"
              className="mx1"
              question={question}
              isResultDirty={isResultDirty}
              result={result}
            />
          )}
        {QueryDownloadWidget.shouldRender({ result, isResultDirty }) && (
          <QueryDownloadWidget
            key="download"
            className="mx1 hide sm-show"
            card={question.card()}
            result={result}
          />
        )}
        {QuestionAlertWidget.shouldRender({
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
        )}
        {QuestionEmbedWidget.shouldRender({ question, isAdmin }) && (
          <QuestionEmbedWidget
            key="embed"
            className="mx1 hide sm-show"
            card={question.card()}
          />
        )}
      </div>
    </ViewSection>
  );
};

const VizTypeButton = ({ className, question, result, selected, onClick }) => {
  // TODO: move this to QuestionResult or something
  const { CardVisualization } = getVisualizationRaw([
    { card: question.card(), data: result.data },
  ]);

  return (
    <span
      className="text-bold flex align-center text-brand bg-light-hover transition-background rounded px1 py1 cursor-pointer"
      onClick={onClick}
    >
      {`Change visualization`}
    </span>
  );
};

const VizSettingsButton = ({ className, selected, onClick }) => (
  <Tooltip tooltip={t`Visualization options`}>
    <Icon
      name="gear"
      className={cx(
        className,
        "cursor-pointer text-light text-brand-hover bg-light-hover transition-all rounded px1 py1",
        {
          "text-brand": selected,
        },
      )}
      onClick={onClick}
    />
  </Tooltip>
);

const VizTableToggle = ({ question, isShowingTable, onShowTable }) => {
  let vizIcon = getIconForVisualizationType(question.display());
  if (!vizIcon || vizIcon === "table") {
    vizIcon = "lineandbar";
  }
  return (
    // wrap in a span since we want to be able to click anywhere to toggle
    <Tooltip tooltip={isShowingTable? t`Show visualization` : t`Show data`}>
      <span
        className="text-brand-hover cursor-pointer"
        onClick={() => onShowTable(!isShowingTable)}
      >
        <IconToggle
          icons={["table", vizIcon]}
          value={isShowingTable ? "table" : vizIcon}
        />
      </span>
    </Tooltip>
  );
};

// TODO: move to it's own file
const IconToggle = ({ className, icons, value, onChange }) => (
  <span
    className={cx(
      className,
      "circular bg-medium text-medium px2 py1 flex align-center",
    )}
  >
    {icons.map(icon => (
      <Icon
        key={icon}
        name={icon}
        className={cx("mx1", {
          "text-brand": value === icon,
          "text-brand-hover cursor-pointer": value !== icon && onChange,
        })}
        onClick={onChange && value !== icon ? () => onChange(icon) : null}
      />
    ))}
  </span>
);

export default ViewFooter;

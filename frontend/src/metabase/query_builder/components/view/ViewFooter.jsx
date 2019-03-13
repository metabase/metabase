import React from "react";

import { t } from "c-3po";
import cx from "classnames";

import Icon from "metabase/components/Icon";

import ViewSection from "./ViewSection";

import { getVisualizationRaw } from "metabase/visualizations";

const ViewFooter = ({
  question,
  result,
  className,
  isShowingChartTypeSidebar,
  isShowingChartSettingsSidebar,
  isShowingTable,
  setUIControls,
  isObjectDetail,
}) => {
  if (!result || isObjectDetail) {
    return null;
  }

  return (
    <ViewSection
      className={cx(className, "flex align-center text-medium")}
      bottom
    >
      <div className="flex align-center">
        <VizTypeButton
          question={question}
          result={result}
          selected={isShowingChartTypeSidebar}
          onClick={() =>
            setUIControls({
              isShowingChartTypeSidebar: !isShowingChartTypeSidebar,
              isShowingChartSettingsSidebar: false, // TODO: move to reducer?
            })
          }
        />
        <VizSettingsButton
          className="ml2"
          selected={isShowingChartSettingsSidebar}
          onClick={() =>
            setUIControls({
              isShowingChartSettingsSidebar: !isShowingChartSettingsSidebar,
              isShowingChartTypeSidebar: false, // TODO: move to reducer?
            })
          }
        />
      </div>
      <div className="ml-auto flex align-center">
        {question.display() !== "scalar" && (
          <VizTableToggle
            isShowingTable={isShowingTable || question.display() === "table"}
            onShowTable={isShowingTable =>
              question.display() === "table" && !isShowingTable
                ? setUIControls({
                    isShowingChartTypeSidebar: true,
                    isShowingChartSettingsSidebar: false, // TODO: move to reducer?
                  })
                : setUIControls({ isShowingTable })
            }
          />
        )}
      </div>
    </ViewSection>
  );
};

const VizTypeButton = ({ className, question, result, selected, onClick }) => {
  // TODO: move this to QuestionResult or something
  let { CardVisualization } = getVisualizationRaw([
    { card: question.card(), data: result.data },
  ]);

  return (
    <span className="h3 flex align-center">
      {`Visualization`}:
      <span
        className={cx("ml1 text-brand flex align-center", {
          "cursor-pointer": onClick,
        })}
        onClick={onClick}
      >
        {CardVisualization ? CardVisualization.uiName : `[${t`Unknown`}]`}
        {onClick && (
          <Icon
            name={selected ? "chevronup" : "chevrondown"}
            ml={1}
            size={12}
          />
        )}
      </span>
    </span>
  );
};

const VizSettingsButton = ({ className, selected, onClick }) => (
  <Icon
    name="gear"
    className={cx(className, "cursor-pointer text-brand-hover", {
      "text-brand": selected,
    })}
    onClick={onClick}
  />
);

const VizTableToggle = ({ className, isShowingTable, onShowTable }) => (
  <IconToggle
    icons={["table", "lineandbar"]}
    value={isShowingTable ? "table" : "lineandbar"}
    onChange={value => onShowTable(value === "table")}
  />
);

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
        onClick={value !== icon ? () => onChange(icon) : null}
      />
    ))}
  </span>
);

export default ViewFooter;

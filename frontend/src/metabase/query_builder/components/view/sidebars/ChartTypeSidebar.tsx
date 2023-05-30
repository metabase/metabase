import React, { useCallback, useMemo } from "react";
import _ from "underscore";
import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

import visualizations from "metabase/visualizations";
import { sanatizeResultData } from "metabase/visualizations/shared/utils/data";
import { Visualization } from "metabase/visualizations/shared/types/visualization";

import { UpdateQuestionOpts } from "metabase/query_builder/actions";

import Question from "metabase-lib/Question";
import Query from "metabase-lib/queries/Query";

import {
  OptionIconContainer,
  OptionList,
  OptionRoot,
  OptionText,
  OptionLabel,
  SettingsButton,
} from "./ChartTypeSidebar.styled";

const DEFAULT_ORDER = [
  "table",
  "bar",
  "line",
  "pie",
  "scalar",
  "row",
  "area",
  "combo",
  "pivot",
  "smartscalar",
  "gauge",
  "progress",
  "funnel",
  "object",
  "map",
  "scatter",
  "waterfall",
];

interface ChartTypeSidebarProps {
  question: Question;
  result: any;
  onOpenChartSettings: (props: {
    initialChartSettings: { section: string };
    showSidebarTitle: boolean;
  }) => void;
  onCloseChartType: () => void;
  updateQuestion: (question: Question, props: UpdateQuestionOpts) => void;
  setUIControls: (props: { isShowingRawTable: boolean }) => void;
  query: Query;
}

const ChartTypeSidebar = ({
  question,
  result,
  onOpenChartSettings,
  onCloseChartType,
  updateQuestion,
  setUIControls,
  query,
}: ChartTypeSidebarProps) => {
  const [makesSense, nonSense] = useMemo(() => {
    return _.partition(
      _.union(
        DEFAULT_ORDER,
        Array.from(visualizations).map(([vizType]) => vizType),
      ).filter(vizType => !visualizations.get(vizType).hidden),
      vizType => {
        const visualization = visualizations.get(vizType);
        return (
          result &&
          result.data &&
          visualization.isSensible &&
          visualization.isSensible(sanatizeResultData(result.data), query)
        );
      },
    );
  }, [result, query]);

  const openChartSettings = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();

      onOpenChartSettings({
        initialChartSettings: { section: t`Data` },
        showSidebarTitle: true,
      });
    },
    [onOpenChartSettings],
  );

  const handleClick = useCallback(
    (display, e) => {
      if (display === question.display()) {
        openChartSettings(e);
      } else {
        let newQuestion = question.setDisplay(display).lockDisplay(); // prevent viz auto-selection
        const visualization = visualizations.get(display);
        if (visualization.onDisplayUpdate) {
          const updatedSettings = visualization.onDisplayUpdate(
            newQuestion.settings(),
          );
          newQuestion = newQuestion.updateSettings(updatedSettings);
        }

        updateQuestion(newQuestion, {
          shouldUpdateUrl: question.query().isEditable(),
        });
        setUIControls({ isShowingRawTable: false });
      }
    },
    [question, updateQuestion, setUIControls, openChartSettings],
  );

  return (
    <SidebarContent
      className="full-height px1"
      onDone={() => onCloseChartType()}
    >
      <OptionList data-testid="display-options-sensible">
        {makesSense.map(type => {
          const visualization = visualizations.get(type);
          return (
            visualization && (
              <ChartTypeOption
                key={type}
                visualization={visualization}
                isSelected={type === question.display()}
                isSensible
                onClick={e => handleClick(type, e)}
                onSettingsClick={openChartSettings}
              />
            )
          );
        })}
      </OptionList>
      <OptionLabel>{t`Other charts`}</OptionLabel>
      <OptionList data-testid="display-options-not-sensible">
        {nonSense.map(type => {
          const visualization = visualizations.get(type);
          return (
            visualization && (
              <ChartTypeOption
                key={type}
                visualization={visualization}
                isSelected={type === question.display()}
                isSensible={false}
                onClick={e => handleClick(type, e)}
                onSettingsClick={openChartSettings}
              />
            )
          );
        })}
      </OptionList>
    </SidebarContent>
  );
};

interface ChartTypeOptionProps {
  isSelected: boolean;
  isSensible: boolean;
  onClick: (e: React.MouseEvent) => void;
  onSettingsClick: (e: React.MouseEvent) => void;
  visualization: Visualization;
}

const ChartTypeOption = ({
  visualization,
  isSelected,
  isSensible,
  onClick,
  onSettingsClick,
}: ChartTypeOptionProps) => (
  <OptionRoot
    isSelected={isSelected}
    data-testid={`${visualization.uiName}-container`}
    role="option"
    aria-selected={isSelected}
  >
    <OptionIconContainer
      onClick={onClick}
      data-is-sensible={isSensible}
      data-testid={`${visualization.uiName}-button`}
    >
      <Icon name={visualization.iconName} />
      {isSelected && (
        <SettingsButton
          onlyIcon
          icon="gear"
          iconSize={16}
          onClick={onSettingsClick}
        />
      )}
    </OptionIconContainer>
    <OptionText>{visualization.uiName}</OptionText>
  </OptionRoot>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartTypeSidebar;

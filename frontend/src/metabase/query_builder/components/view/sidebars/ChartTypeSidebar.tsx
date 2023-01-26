/* eslint-disable react/prop-types */
import React, { useMemo } from "react";
import _ from "underscore";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

import visualizations from "metabase/visualizations";
import { Visualization } from "metabase/visualizations/shared/types/visualization";

import Question from "metabase-lib/Question";
import Query from "metabase-lib/queries/Query";

import {
  OptionIconContainer,
  OptionList,
  OptionRoot,
  OptionText,
  OptionLabel,
} from "./ChartTypeOption.styled";

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
  onOpenChartSettings: (props: { section: string }) => void;
  onCloseChartType: () => void;
  updateQuestion: (
    question: Question,
    props: { reload: boolean; shouldUpdateUrl: boolean },
  ) => void;
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
        Array.from(visualizations)
          .filter(([_type, visualization]) => !visualization.hidden)
          .map(([vizType]) => vizType),
      ),
      vizType => {
        const visualization = visualizations.get(vizType);
        return (
          result &&
          result.data &&
          visualization.isSensible &&
          visualization.isSensible(result.data, query)
        );
      },
    );
  }, [result, query]);

  return (
    <SidebarContent
      className="full-height px1"
      title={t`Choose a visualization`}
      onDone={onCloseChartType}
    >
      <OptionList>
        {makesSense.map(type => {
          const visualization = visualizations.get(type);
          return (
            visualization && (
              <ChartTypeOption
                key={type}
                visualization={visualization}
                isSelected={type === question.display()}
                isSensible
                onClick={() => {
                  const newQuestion = question.setDisplay(type).lockDisplay(); // prevent viz auto-selection

                  updateQuestion(newQuestion, {
                    reload: false,
                    shouldUpdateUrl: question.query().isEditable(),
                  });
                  onOpenChartSettings({ section: t`Data` });
                  setUIControls({ isShowingRawTable: false });
                }}
              />
            )
          );
        })}
      </OptionList>
      <OptionLabel>{t`Other charts`}</OptionLabel>
      <OptionList>
        {nonSense.map(type => {
          const visualization = visualizations.get(type);
          return (
            visualization && (
              <ChartTypeOption
                key={type}
                visualization={visualization}
                isSelected={type === question.display()}
                isSensible={false}
                onClick={() => {
                  const newQuestion = question.setDisplay(type).lockDisplay(); // prevent viz auto-selection

                  updateQuestion(newQuestion, {
                    reload: false,
                    shouldUpdateUrl: question.query().isEditable(),
                  });
                  onOpenChartSettings({ section: t`Data` });
                  setUIControls({ isShowingRawTable: false });
                }}
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
  onClick: () => void;
  visualization: Visualization;
}

const ChartTypeOption = ({
  visualization,
  isSelected,
  isSensible,
  onClick,
}: ChartTypeOptionProps) => (
  <OptionRoot isSelected={isSelected}>
    <OptionIconContainer
      onClick={onClick}
      data-testid={`${visualization.uiName}-button`}
      data-is-sensible={isSensible}
    >
      <Icon name={visualization.iconName} size={20} />
    </OptionIconContainer>
    <OptionText>{visualization.uiName}</OptionText>
  </OptionRoot>
);

export default ChartTypeSidebar;

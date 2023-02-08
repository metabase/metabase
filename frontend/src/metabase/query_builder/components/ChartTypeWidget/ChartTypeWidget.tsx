import React, { useState } from "react";

import Button from "metabase/core/components/Button";

import visualizations from "metabase/visualizations";

import { groupVisualizations } from "metabase/visualizations/shared/utils/visualization";
import { SingleSeries } from "metabase-types/api";
import Query from "metabase-lib/queries/Query";
import Question from "metabase-lib/Question";

import {
  ChartTypeWidgetRoot,
  ChartTypeWidgetIcon,
} from "./ChartTypeWidget.styled";

interface ChartTypeWidgetProps {
  onOpenChartType: () => void;
  results: SingleSeries;
  query: Query;
  question: Question;
  onUpdateDisplay: (type: string) => void;
}

const ChartTypeWidget = ({
  onOpenChartType,
  results,
  query,
  question,
  onUpdateDisplay,
}: ChartTypeWidgetProps) => {
  const [suggestedVisualizations] = useState(() => {
    const [sensible, nonsense] = groupVisualizations(results, query);
    const suggested = [...sensible, ...nonsense].slice(0, 6);

    if (suggested.includes(question.display())) {
      return suggested;
    } else {
      return [question.display(), ...suggested.slice(0, 5)];
    }
  });

  return (
    <ChartTypeWidgetRoot data-testid="chart-type-widget">
      {suggestedVisualizations.map(vizName => (
        <ChartTypeWidgetIcon
          key={`${vizName}`}
          icon={visualizations.get(vizName).iconName}
          isSelected={vizName === question.display()}
          aria-role="option"
          aria-selected={vizName === question.display()}
          onlyIcon
          onClick={() => onUpdateDisplay(vizName)}
        />
      ))}
      <Button icon="chevrondown" onlyIcon onClick={onOpenChartType} />
    </ChartTypeWidgetRoot>
  );
};

export default ChartTypeWidget;

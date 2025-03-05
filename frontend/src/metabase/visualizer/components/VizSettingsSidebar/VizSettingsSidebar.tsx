import { useMemo } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import {
  getVisualizerComputedSettings,
  getVisualizerRawSeries,
} from "metabase/visualizer/selectors";
import { updateSettings } from "metabase/visualizer/visualizer.slice";
import Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

export function VizSettingsSidebar({ className }: { className?: string }) {
  const series = useSelector(getVisualizerRawSeries);
  const settings = useSelector(getVisualizerComputedSettings);
  const metadata = useSelector(getMetadata);
  const dispatch = useDispatch();

  const question = useMemo(() => {
    if (series.length === 0) {
      return null;
    }
    const [{ card }] = series;
    return new Question(card, metadata);
  }, [series, metadata]);

  const handleChangeSettings = (settings: VisualizationSettings) => {
    dispatch(updateSettings(settings));
  };

  if (!question) {
    return null;
  }

  return (
    <QuestionChartSettings
      question={question}
      series={series}
      computedSettings={settings}
      onChange={handleChangeSettings}
      className={className}
    />
  );
}

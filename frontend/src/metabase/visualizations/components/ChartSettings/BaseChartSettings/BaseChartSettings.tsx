import { useState } from "react";

import { SectionRadio } from "../SectionRadio";
import { WidgetList } from "../WidgetList";
import { useChartSections } from "../hooks";
import type { ChartSettingsInnerProps, Widget } from "../types";

import { ChartSettingsMenu } from "./BaseChartSettings.styled";

export const BaseChartSettings = ({
  chartSettings,
  computedSettings,
  finalWidgetList,
  initial,
  onChange,
  question,
  series,
  transformedSeries,
}: ChartSettingsInnerProps) => {
  const [currentWidget, setCurrentWidget] = useState<Widget | null>(
    initial?.widget ?? null,
  );

  const {
    chartSettingCurrentSection,
    sectionNames,
    setCurrentSection,
    showSectionPicker,
    visibleWidgets,
  } = useChartSections({
    initial,
    widgets: finalWidgetList,
  });

  return (
    <ChartSettingsMenu data-testid="chartsettings-sidebar">
      {showSectionPicker && (
        <SectionRadio
          options={sectionNames}
          setCurrentWidget={setCurrentWidget}
          currentSection={chartSettingCurrentSection}
          setCurrentSection={setCurrentSection}
        />
      )}
      <WidgetList
        chartSettings={chartSettings}
        onChange={onChange}
        widgets={finalWidgetList}
        visibleWidgets={visibleWidgets}
        question={question}
        series={series}
        computedSettings={computedSettings}
        setCurrentWidget={setCurrentWidget}
        currentWidget={currentWidget}
        transformedSeries={transformedSeries}
      />
    </ChartSettingsMenu>
  );
};

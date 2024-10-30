import { useCallback, useState } from "react";

import Radio from "metabase/core/components/Radio";
import CS from "metabase/css/core/index.css";

import ChartSettingsWidgetList from "../../ChartSettingsWidgetList";
import type { Widget } from "../types";

import {
  ChartSettingsListContainer,
  ChartSettingsMenu,
  SectionContainer,
} from "./BaseChartSettings.styled";
import { useChartSettingsSections } from "./hooks";
import type { BaseChartSettingsProps } from "./types";

export const BaseChartSettings = ({
  initial,
  series,
  computedSettings = {},
  onChange,
  question,
  widgets,
  chartSettings,
  transformedSeries,
}: BaseChartSettingsProps) => {
  const {
    chartSettingCurrentSection,
    sectionNames,
    setCurrentSection,
    showSectionPicker,
    visibleWidgets,
  } = useChartSettingsSections({
    initial,
    widgets,
  });
  const [currentWidget, setCurrentWidget] = useState<Widget | null>(
    initial?.widget ?? null,
  );

  const handleShowSection = useCallback(
    (section: string) => {
      setCurrentSection(section);
      setCurrentWidget(null);
    },
    [setCurrentSection],
  );

  return (
    <>
      <ChartSettingsMenu data-testid="chartsettings-sidebar">
        {showSectionPicker && (
          <SectionContainer>
            <Radio
              value={chartSettingCurrentSection ?? undefined}
              onChange={handleShowSection}
              options={sectionNames}
              optionNameFn={v => v}
              optionValueFn={v => v}
              optionKeyFn={v => v}
              variant="underlined"
            />
          </SectionContainer>
        )}
        <ChartSettingsListContainer className={CS.scrollShow}>
          <ChartSettingsWidgetList
            widgets={widgets}
            visibleWidgets={visibleWidgets}
            question={question}
            series={series}
            computedSettings={computedSettings}
            currentWidget={currentWidget}
            setCurrentWidget={setCurrentWidget}
            transformedSeries={transformedSeries}
            chartSettings={chartSettings}
            onChange={onChange}
          />
        </ChartSettingsListContainer>
      </ChartSettingsMenu>
    </>
  );
};

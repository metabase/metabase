import * as React from "react";

import { getAccentColors } from "metabase/lib/colors/groups";
import ColorSelector from "metabase/core/components/ColorSelector";
import type { SingleSeries, VisualizationSettings } from "metabase-types/api";

import { SeriesNameInput } from "./ChartNestedSettingSeries.styled";

export interface ChartNestedSettingsSeriesSingleProps {
  object: SingleSeries;
  getObjectKey: (object: SingleSeries) => string;
  onChangeObjectSettings: (
    object: SingleSeries,
    value: Record<string, any>,
  ) => void;
  objectSettingsWidgets: React.ReactNode[];
  allComputedSettings: VisualizationSettings;
  seriesCardNames: Record<string, string>;
}

// various props injected by chartSettingNestedSettings HOC
const ChartNestedSettingsSeriesSingle = ({
  getObjectKey,
  onChangeObjectSettings,
  objectSettingsWidgets,
  object,
  allComputedSettings,
  seriesCardNames,
}: ChartNestedSettingsSeriesSingleProps) => {
  const objectKey = object && getObjectKey(object);
  const computedSettings = allComputedSettings[objectKey] || {};
  const seriesCardName = seriesCardNames?.[objectKey];

  return (
    <div
      key={objectKey}
      className="px4 align-self-stretch"
      data-testid="series-settings"
    >
      <div className="flex align-center border-bottom pb2">
        <ColorSelector
          value={computedSettings.color}
          colors={getAccentColors()}
          onChange={value => onChangeObjectSettings(object, { color: value })}
        />
        <SeriesNameInput
          className="flex-full ml1 align-self-stretch"
          value={computedSettings.title}
          aria-label="series-name-input"
          subtitle={
            seriesCardName === computedSettings.title ? "" : seriesCardName
          }
          onBlurChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChangeObjectSettings(object, { title: e.target.value })
          }
        />
      </div>
      {objectSettingsWidgets && objectSettingsWidgets.length > 0 ? (
        <div className="mt3">{objectSettingsWidgets}</div>
      ) : null}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartNestedSettingsSeriesSingle;

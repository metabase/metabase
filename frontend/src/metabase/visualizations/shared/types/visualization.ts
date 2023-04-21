import { DatasetData, Series, VisualizationSettings } from "metabase-types/api";

export type Visualization = {
  uiName: string;
  identifier: string;
  iconName: string;
  noun: string;
  hidden?: boolean;
  noHeader: boolean;
  minSize: {
    width: number;
    height: number;
  };
  defaultSize: {
    width: number;
    height: number;
  };

  isSensible: (data: DatasetData) => boolean;
  isLiveResizable: (series: Series) => boolean;

  settings: VisualizationSettings;

  transformSeries: (series: Series) => Series;

  checkRenderable: (series: Series, settings: VisualizationSettings) => boolean;

  placeHolderSeries: Series;
};

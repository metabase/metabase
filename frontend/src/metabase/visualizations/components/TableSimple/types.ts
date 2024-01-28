import type {
  Card,
  DatasetData,
  Series,
  VisualizationSettings,
} from "metabase-types/api";
import type { ClickObject } from "metabase-lib";

export interface TableSimpleProps {
  card: Card;
  data: DatasetData;
  series: Series;
  settings: VisualizationSettings;
  height: number;
  isDashboard?: boolean;
  isEditing?: boolean;
  isPivoted: boolean;
  className?: string;
  getColumnTitle: (colIndex: number) => string;
  getExtraDataForClick: (clickObject: ClickObject) => any;
  onVisualizationClick?: (clickObject: ClickObject) => void;
  visualizationIsClickable?: (clickObject: ClickObject) => boolean;
}

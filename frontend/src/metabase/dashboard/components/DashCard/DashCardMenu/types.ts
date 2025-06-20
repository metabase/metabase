import type { DashboardCardMenuProps } from "metabase/dashboard/context/types/dashcard-menu";
import type { DashboardCard } from "metabase-types/api";
import type { VisualizerVizDefinitionWithColumns } from "metabase-types/store/visualizer";

export type UseDashcardMenuItemsProps = DashboardCardMenuProps & {
  onEditVisualization?: (
    dashcard: DashboardCard,
    initialState: VisualizerVizDefinitionWithColumns,
  ) => void;
  isDownloadingData?: boolean;
  onDownload?: () => void;
};

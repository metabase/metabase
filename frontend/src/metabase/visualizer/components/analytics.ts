import { trackSimpleEvent } from "metabase/utils/analytics";

type VisualizerDataChangedDetail =
  | "visualizer_viz_type_changed"
  | "visualizer_datasource_removed"
  | "visualizer_datasource_added"
  | "visualizer_datasource_replaced"
  | "visualizer_datasource_reset"
  | "visualizer_column_removed"
  | "visualizer_column_added";

export const trackVisualizerDataChanged = (
  eventDetail: VisualizerDataChangedDetail,
) =>
  trackSimpleEvent({
    event: "visualizer_data_changed",
    event_detail: eventDetail,
    triggered_from: "visualizer-modal",
  });

export const trackVisualizerShowColumnsClicked = () =>
  trackSimpleEvent({
    event: "visualizer_show_columns_clicked",
    triggered_from: "visualizer-modal",
  });

export const trackVisualizerAddMoreDataClicked = () =>
  trackSimpleEvent({
    event: "visualizer_add_more_data_clicked",
    triggered_from: "visualizer-modal",
  });

export const trackVisualizerSettingsClicked = () =>
  trackSimpleEvent({
    event: "visualizer_settings_clicked",
    triggered_from: "visualizer-modal",
  });

export const trackVisualizerSaveClicked = () =>
  trackSimpleEvent({
    event: "visualizer_save_clicked",
    triggered_from: "visualizer-modal",
  });

export const trackVisualizerCloseClicked = () =>
  trackSimpleEvent({
    event: "visualizer_close_clicked",
    triggered_from: "visualizer-modal",
  });

export const trackVisualizerViewAsTableClicked = () =>
  trackSimpleEvent({
    event: "visualizer_view_as_table_clicked",
    triggered_from: "visualizer-modal",
  });

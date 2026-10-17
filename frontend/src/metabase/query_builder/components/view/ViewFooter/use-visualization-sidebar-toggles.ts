import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { useDispatch, useSelector } from "metabase/redux";
import type { QueryBuilderUIControls } from "metabase/redux/store";

import {
  onCloseChartSettings,
  onCloseChartType,
  onOpenChartSettings,
  onOpenChartType,
} from "../../../store/actions";
import { getUiControls } from "../../../store/selectors";

/**
 * Open/close state and toggles for the visualization type and settings sidebars,
 * including their keyboard shortcuts. Render it from one place at a time.
 */
export function useVisualizationSidebarToggles() {
  const {
    isShowingChartSettingsSidebar,
    isShowingChartTypeSidebar,
  }: QueryBuilderUIControls = useSelector(getUiControls);
  const dispatch = useDispatch();

  const toggleChartType = isShowingChartTypeSidebar
    ? () => dispatch(onCloseChartType())
    : () => dispatch(onOpenChartType());

  const toggleChartSettings = isShowingChartSettingsSidebar
    ? () => dispatch(onCloseChartSettings())
    : () => dispatch(onOpenChartSettings());

  useRegisterShortcut(
    [
      {
        id: "query-builder-toggle-viz-types",
        perform: toggleChartType,
      },
      {
        id: "query-builder-toggle-viz-settings",
        perform: toggleChartSettings,
      },
    ],
    [isShowingChartTypeSidebar, isShowingChartSettingsSidebar],
  );

  return {
    isShowingChartTypeSidebar,
    isShowingChartSettingsSidebar,
    toggleChartType,
    toggleChartSettings,
  };
}

import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/redux";
import { Box, Center, Flex, Loader } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import {
  getUsedDataSources,
  getVisualizationType,
  getVisualizerRawSeries,
} from "metabase/visualizer/selectors";
import { setDisplay } from "metabase/visualizer/visualizer.slice";
import { isCartesianChart } from "metabase/viz-core";
import type { VisualizationDisplay } from "metabase-types/api";

import { VisualizationPicker } from "../VisualizationPicker";
import { VizSettingsSidebar } from "../VizSettingsSidebar/VizSettingsSidebar";

import S from "./VisualizationEditor.module.css";

export function AppearanceEditor() {
  const dispatch = useDispatch();
  const rawSeries = useSelector(getVisualizerRawSeries);
  const display = useSelector(getVisualizationType);
  const dataSourceCount = useSelector(getUsedDataSources).length;

  const handleChangeDisplay = useCallback(
    (nextDisplay: string) => {
      // The picker offers only keys of the visualization registry, and those
      // are displays, but the segmented control gives a plain string.
      dispatch(setDisplay(nextDisplay as VisualizationDisplay));
    },
    [dispatch],
  );

  return (
    <Box className={S.AppearanceLayout}>
      <Box className={S.Chart}>
        {rawSeries.length > 0 ? (
          <Visualization rawSeries={rawSeries} isDashboard isVisualizer />
        ) : (
          <Center h="100%">
            <Loader />
          </Center>
        )}
      </Box>
      <Flex className={S.Footer} px="xl" py="md">
        {display && (
          <VisualizationPicker
            value={display}
            onChange={handleChangeDisplay}
            // A chart with several questions shares one x-axis, so it can only
            // switch between the chart types that have an x-axis.
            filter={dataSourceCount > 1 ? isCartesianChart : undefined}
          />
        )}
      </Flex>
      <Box className={S.SettingsSidebar}>
        <VizSettingsSidebar />
      </Box>
    </Box>
  );
}

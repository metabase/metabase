import { useCallback } from "react";
import { t } from "ttag";

import { trackSimpleEvent } from "metabase/lib/analytics";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Button, Flex } from "metabase/ui";
import {
  getDatasets,
  getIsLoading,
  getVisualizationType,
} from "metabase/visualizer/selectors";
import { setDisplay } from "metabase/visualizer/visualizer.slice";
import type { VisualizationDisplay } from "metabase-types/api";

import { VisualizationPicker } from "../VisualizationPicker";
import { useVisualizerUi } from "../VisualizerUiContext";

import S from "./Footer.module.css";

export function Footer({ className }: { className?: string }) {
  const { setVizSettingsSidebarOpen } = useVisualizerUi();
  const dispatch = useDispatch();
  const display = useSelector(getVisualizationType);
  const datasets = useSelector(getDatasets);
  const hasDatasets = Object.values(datasets).length > 0;

  const isLoading = useSelector(getIsLoading);

  const handleChangeDisplay = useCallback(
    (nextDisplay: string) => {
      dispatch(setDisplay(nextDisplay as VisualizationDisplay));
    },
    [dispatch],
  );
  return (
    <Flex className={`${S.footer} ${className}`} px="xl" py="md">
      {display && !isLoading && (
        <VisualizationPicker value={display} onChange={handleChangeDisplay} />
      )}
      {hasDatasets && (
        <Button
          ml="auto"
          onClick={() => {
            trackSimpleEvent({
              event: "visualizer_settings_clicked",
              triggered_from: "visualizer-modal",
            });

            setVizSettingsSidebarOpen((isOpen) => !isOpen);
          }}
        >{t`Settings`}</Button>
      )}
    </Flex>
  );
}

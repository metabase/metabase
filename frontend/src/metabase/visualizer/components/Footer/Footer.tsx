import { useCallback, useState } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Button, Flex, Icon } from "metabase/ui";
import {
  getDatasets,
  getIsLoading,
  getVisualizationType,
} from "metabase/visualizer/selectors";
import { setDisplay } from "metabase/visualizer/visualizer.slice";
import type { VisualizationDisplay } from "metabase-types/api";

import { TabularPreviewModal } from "../TabularPreviewModal";
import { VisualizationPicker } from "../VisualizationPicker";
import { useVisualizerUi } from "../VisualizerUiContext";

import S from "./Footer.module.css";

export function Footer({ className }: { className?: string }) {
  const { setVizSettingsSidebarOpen } = useVisualizerUi();
  const [isTabularPreviewOpen, setTabularPreviewOpen] = useState(false);

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
    <Flex className={`${S.footer} ${className}`} px="xl" py="md" gap={12}>
      {display && !isLoading && (
        <VisualizationPicker value={display} onChange={handleChangeDisplay} />
      )}

      {/* Spacer */}
      <Box flex={1} />

      <Button
        leftSection={<Icon name="table" />}
        onClick={() => setTabularPreviewOpen(true)}
      >{t`View as table`}</Button>

      {hasDatasets && (
        <Button
          leftSection={<Icon name="gear" />}
          onClick={() => setVizSettingsSidebarOpen((isOpen) => !isOpen)}
        >{t`Settings`}</Button>
      )}
      <TabularPreviewModal
        opened={isTabularPreviewOpen}
        onClose={() => setTabularPreviewOpen(false)}
      />
    </Flex>
  );
}

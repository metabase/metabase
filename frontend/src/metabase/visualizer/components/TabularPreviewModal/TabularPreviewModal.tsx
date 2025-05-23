import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { Box, Modal } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { getTabularPreviewSeries } from "metabase/visualizer/selectors";

interface TabularPreviewModalProps {
  opened: boolean;
  onClose: () => void;
}

export function TabularPreviewModal({
  opened,
  onClose,
}: TabularPreviewModalProps) {
  const series = useSelector(getTabularPreviewSeries);

  if (series.length === 0) {
    return null;
  }

  return (
    <Modal opened={opened} title={t`Preview`} size="xl" onClose={onClose}>
      <Box h="60vh">
        <Visualization
          rawSeries={series}
          // TableInteractive crashes when trying to use metabase-lib
          isDashboard
        />
      </Box>
    </Modal>
  );
}

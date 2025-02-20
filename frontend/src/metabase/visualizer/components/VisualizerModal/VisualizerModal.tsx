import { useEffect } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { useModalOpen } from "metabase/hooks/use-modal-open";
import { useDispatch } from "metabase/lib/redux";
import { Modal } from "metabase/ui";
import { initializeVisualizer } from "metabase/visualizer/visualizer.slice";
import type {
  VisualizerDataSourceId,
  VisualizerHistoryItem,
} from "metabase-types/store/visualizer";

import { Visualizer } from "../Visualizer";

interface VisualizerModalProps {
  initialState?: {
    state?: Partial<VisualizerHistoryItem>;
    extraDataSources?: VisualizerDataSourceId[];
  };
  onSave: (visualization: VisualizerHistoryItem) => void;
  onClose: () => void;
  saveLabel?: string;
}

export function VisualizerModal({
  initialState,
  onSave,
  onClose,
  saveLabel,
}: VisualizerModalProps) {
  const { open } = useModalOpen();
  const wasOpen = usePrevious(open);
  const dispatch = useDispatch();

  useEffect(() => {
    if (open && !wasOpen && initialState) {
      dispatch(initializeVisualizer(initialState));
    }
  }, [open, wasOpen, initialState, dispatch]);

  return (
    <Modal
      opened={open}
      title={t`Visualize`}
      size="95%"
      transitionProps={{ transition: "fade", duration: 200 }}
      onClose={onClose}
    >
      <Visualizer
        onSave={onSave}
        style={{ height: "80vh" }}
        saveLabel={saveLabel}
      />
    </Modal>
  );
}

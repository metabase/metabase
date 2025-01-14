import { t } from "ttag";

import { useModalOpen } from "metabase/hooks/use-modal-open";
import { Modal } from "metabase/ui";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

import { Visualizer } from "../Visualizer";

interface VisualizerModalProps {
  onSave: (visualization: VisualizerHistoryItem) => void;
  onClose: () => void;
}

export function VisualizerModal({ onSave, onClose }: VisualizerModalProps) {
  const { open } = useModalOpen();

  return (
    <Modal
      opened={open}
      title={t`Visualize`}
      size="95%"
      transitionProps={{ transition: "fade", duration: 200 }}
      onClose={onClose}
    >
      <Visualizer onSave={onSave} />
    </Modal>
  );
}

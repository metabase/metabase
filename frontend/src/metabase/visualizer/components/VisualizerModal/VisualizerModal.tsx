import { useCallback, useEffect, useRef } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { useConfirmation } from "metabase/hooks/use-confirmation";
import { useModalOpen } from "metabase/hooks/use-modal-open";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Modal } from "metabase/ui";
import { getVisualizerUrlHash } from "metabase/visualizer/selectors";
import { initializeVisualizer } from "metabase/visualizer/visualizer.slice";
import type {
  VisualizerDataSourceId,
  VisualizerHistoryItem,
} from "metabase-types/store/visualizer";

import { Visualizer } from "../Visualizer";

import S from "./VisualizerModal.module.css";
function useHasChanged() {
  const initialHash = useRef<string | undefined>();

  const hash = useSelector(getVisualizerUrlHash);

  useEffect(() => {
    if (!initialHash.current) {
      initialHash.current = hash;
    }
  }, [hash]);

  return !!initialHash.current && hash !== initialHash.current;
}

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

  const { modalContent, show: askConfirmation } = useConfirmation();

  const hasChanged = useHasChanged();

  const onModalClose = useCallback(() => {
    if (!hasChanged) {
      onClose();
      return;
    }

    askConfirmation({
      title: t`Are you sure you want to leave?`,
      message: t`Any unsaved changes in this dialog will be lost.`,
      confirmButtonText: t`Close`,
      onConfirm: onClose,
    });
  }, [askConfirmation, hasChanged, onClose]);

  useEffect(() => {
    if (open && !wasOpen && initialState) {
      dispatch(initializeVisualizer(initialState));
    }
  }, [open, wasOpen, initialState, dispatch]);

  return (
    <>
      <Modal
        opened={open}
        title={t`Visualize`}
        size="100%"
        transitionProps={{ transition: "fade", duration: 200 }}
        onClose={onModalClose}
      >
        <Visualizer
          className={S.VisualizerRoot}
          onSave={onSave}
          saveLabel={saveLabel}
        />
      </Modal>
      {modalContent}
    </>
  );
}

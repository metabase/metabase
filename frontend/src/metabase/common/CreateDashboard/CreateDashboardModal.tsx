import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useEscapeToCloseModal } from "metabase/common/hooks/use-escape-to-close-modal";
import type { SdkCollectionId } from "metabase/embed/sdk-bundle/types";
import { Modal, type ModalProps } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import type { CollectionId, Dashboard } from "metabase-types/api";

import { CreateDashboardForm } from "./CreateDashboardForm";

export interface CreateDashboardModalProps {
  opened: boolean;
  collectionId?: CollectionId | null; // can be used by `getInitialCollectionId`
  targetCollection?: SdkCollectionId | null;
  onCreate?: (dashboard: Dashboard) => void;
  onClose: () => void;
}

export const CreateDashboardModal = ({
  opened,
  collectionId,
  targetCollection,
  onCreate,
  onClose,
}: CreateDashboardModalProps & Omit<ModalProps, "onClose">) => {
  const dispatch = useDispatch();
  const handleCreate = useCallback(
    (dashboard: Dashboard) => {
      if (typeof onCreate === "function") {
        onCreate(dashboard);
      } else {
        onClose?.();
        dispatch(push(Urls.dashboard(dashboard, { editMode: true })));
      }
    },
    [onCreate, onClose, dispatch],
  );

  useEscapeToCloseModal(onClose);

  return (
    <Modal
      title={t`New dashboard`}
      onClose={() => onClose?.()}
      data-testid="new-dashboard-modal"
      size="lg"
      closeOnEscape={false}
      opened={opened}
    >
      <CreateDashboardForm
        onCreate={handleCreate}
        onCancel={onClose}
        collectionId={collectionId}
        targetCollection={targetCollection}
      />
    </Modal>
  );
};

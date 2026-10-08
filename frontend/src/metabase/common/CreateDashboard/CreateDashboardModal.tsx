import { useCallback } from "react";
import { t } from "ttag";

import type { EntityPickerModalProps } from "metabase/common/components/Pickers";
import { useNavigate } from "metabase/router";
import { Modal, type ModalProps } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { CollectionId, Dashboard } from "metabase-types/api";

import { CreateDashboardForm } from "./CreateDashboardForm";

export interface CreateDashboardModalProps {
  opened: boolean;
  collectionId?: CollectionId | null; // can be used by `getInitialCollectionId`
  targetCollection?: CollectionId | null;
  collectionPickerModalProps?: Partial<EntityPickerModalProps>;
  onCreate?: (dashboard: Dashboard) => void;
  onClose: () => void;
}

export const CreateDashboardModal = ({
  opened,
  collectionId,
  targetCollection,
  collectionPickerModalProps,
  onCreate,
  onClose,
}: CreateDashboardModalProps & Omit<ModalProps, "onClose">) => {
  const navigate = useNavigate();
  const handleCreate = useCallback(
    (dashboard: Dashboard) => {
      if (typeof onCreate === "function") {
        onCreate(dashboard);
      } else {
        onClose?.();
        navigate(Urls.dashboard(dashboard, { editMode: true }));
      }
    },
    [onCreate, onClose, navigate],
  );

  return (
    <Modal
      title={t`New dashboard`}
      onClose={() => onClose?.()}
      data-testid="new-dashboard-modal"
      size="lg"
      opened={opened}
    >
      <CreateDashboardForm
        onCreate={handleCreate}
        onCancel={onClose}
        collectionId={collectionId}
        targetCollection={targetCollection}
        collectionPickerModalProps={collectionPickerModalProps}
      />
    </Modal>
  );
};

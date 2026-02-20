import { useCallback } from "react";
import { t } from "ttag";

import type { SdkCollectionId } from "embedding-sdk-bundle/types";
import { useEscapeToCloseModal } from "metabase/common/hooks/use-escape-to-close-modal";
import * as Urls from "metabase/lib/urls";
import { useNavigation } from "metabase/routing/compat";
import { Modal, type ModalProps } from "metabase/ui";
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
  const { push } = useNavigation();
  const handleCreate = useCallback(
    (dashboard: Dashboard) => {
      if (typeof onCreate === "function") {
        onCreate(dashboard);
      } else {
        onClose?.();
        push(Urls.dashboard(dashboard, { editMode: true }));
      }
    },
    [onCreate, onClose, push],
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

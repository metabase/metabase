import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Modal, type ModalProps } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import type { CreateDashboardFormOwnProps } from "./CreateDashboardForm";
import { CreateDashboardForm } from "./CreateDashboardForm";

interface CreateDashboardModalProps
  extends Omit<CreateDashboardFormOwnProps, "onCancel"> {
  onClose?: () => void;
}

export const CreateDashboardModal = ({
  onCreate,
  onClose,
  initialValues,
  filterPersonalCollections,
  collectionId,
  ...modalProps
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

  return (
    <Modal
      title={t`New dashboard`}
      onClose={() => onClose?.()}
      data-testid="new-dashboard-modal"
      size="lg"
      {...modalProps}
    >
      <CreateDashboardForm
        onCreate={handleCreate}
        onCancel={onClose}
        initialValues={initialValues}
        filterPersonalCollections={filterPersonalCollections}
        collectionId={collectionId}
      />
    </Modal>
  );
};

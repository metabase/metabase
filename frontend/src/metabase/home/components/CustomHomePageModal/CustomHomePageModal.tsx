import { useState, useCallback } from "react";
import { t } from "ttag";
import { useDispatch } from "metabase/lib/redux";
import { updateSettings } from "metabase/admin/settings/settings";
import { refreshCurrentUser } from "metabase/redux/user";

import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

import { DashboardSelector } from "metabase/components/DashboardSelector/DashboardSelector";
import Button from "metabase/core/components/Button/Button";
import { Collection, DashboardId } from "metabase-types/api";

const CUSTOM_HOMEPAGE_SETTING_KEY = "custom-homepage";
const CUSTOM_HOMEPAGE_DASHBOARD_SETTING_KEY = "custom-homepage-dashboard";
const CUSTOM_HOMEPAGE_REDIRECT_TOAST_KEY = "dismissed_custom_dashboard_toast";

interface CustomHomePageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CustomHomePageModal = ({
  isOpen,
  onClose,
}: CustomHomePageModalProps) => {
  const [dashboardId, setDashboardId] = useState<DashboardId>();
  const dispatch = useDispatch();

  const handleSave = async () => {
    await dispatch(
      updateSettings({
        [CUSTOM_HOMEPAGE_DASHBOARD_SETTING_KEY]: dashboardId,
        [CUSTOM_HOMEPAGE_SETTING_KEY]: true,
        [CUSTOM_HOMEPAGE_REDIRECT_TOAST_KEY]: true,
      }),
    );
    await dispatch(refreshCurrentUser());
  };

  const handleChange = useCallback(
    (value?: DashboardId) => {
      if (value) {
        setDashboardId(value);
      } else {
        setDashboardId(undefined);
      }
    },
    [setDashboardId],
  );

  const handleClose = useCallback(() => {
    setDashboardId(undefined);
    onClose();
  }, [onClose, setDashboardId]);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalContent
        title="Customize Homepage"
        onClose={handleClose}
        footer={[
          <Button onClick={handleClose} key="custom-homepage-modal-cancel">
            Cancel
          </Button>,
          <Button
            primary
            onClick={handleSave}
            key="custom-homepage-modal-save"
            disabled={!dashboardId}
          >
            Save
          </Button>,
        ]}
      >
        <p>{t`Pick a dashboard to serve as the homepage. If people lack permissions to view the selected dashboard, Metabase will redirect them to the default homepage. You can update or reset the homepage at any time in Admin Settings > Settings > General`}</p>
        <DashboardSelector
          value={dashboardId}
          onChange={handleChange}
          collectionFilter={(collection: Collection) =>
            collection.personal_owner_id === null || collection.id === "root"
          }
        />
      </ModalContent>
    </Modal>
  );
};

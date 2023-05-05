import React, { useState } from "react";
import { t } from "ttag";
import { useDispatch } from "metabase/lib/redux";
import { updateSettings } from "metabase/admin/settings/settings";
import { refreshCurrentUser } from "metabase/redux/user";

import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

import DashboardSelector from "metabase/components/DashboardSelector/DashboardSelector";
import Button from "metabase/core/components/Button/Button";

const CUSTOM_HOMEPAGE_SETTING_KEY = "custom-homepage";
const CUSTOM_HOMEPAGE_DASHBOARD_SETTING_KEY = "custom-homepage-dashboard";

interface CustomHomePageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CustomHomePageModal = ({ isOpen, onClose }: CustomHomePageModalProps) => {
  const [dashboard, setDashboard] = useState();
  const dispatch = useDispatch();

  const handleSave = async () => {
    await dispatch(
      updateSettings({
        [CUSTOM_HOMEPAGE_DASHBOARD_SETTING_KEY]: dashboard,
        [CUSTOM_HOMEPAGE_SETTING_KEY]: true,
      }),
    );
    await dispatch(refreshCurrentUser());
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalContent
        title="Customize Homepage"
        onClose={onClose}
        footer={[
          <Button onClick={onClose} key="custom-homepage-modal-cancel">
            Cancel
          </Button>,
          <Button primary onClick={handleSave} key="custom-homepage-modal-save">
            Save
          </Button>,
        ]}
      >
        <p>{t`Pick one of your dashboards to serve as a homepage. to reset, go to
          Admin Settings / Settings / General to disable it.`}</p>
        <DashboardSelector value={dashboard} onChange={setDashboard} />
      </ModalContent>
    </Modal>
  );
};

export default CustomHomePageModal;

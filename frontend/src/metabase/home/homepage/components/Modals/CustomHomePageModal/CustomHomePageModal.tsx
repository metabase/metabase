import React, { useState } from "react";
import { useDispatch } from "metabase/lib/redux";
import { updateSettings } from "metabase/admin/settings/settings";

import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

import DashboardSelector from "metabase/admin/settings/components/widgets/DashboardSelector/DashboardSelector";
import Button from "metabase/core/components/Button/Button";

interface CustomHomePageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CustomHomePageModal = ({ isOpen, onClose }: CustomHomePageModalProps) => {
  const [dashboard, setDashboard] = useState();
  const dispatch = useDispatch();

  const handleSave = () => {
    dispatch(
      updateSettings({
        "custom-homepage-dashboard": dashboard,
        "custom-homepage": true,
      }),
    );
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
        <p>
          Pick one of your dashboards to serve as a homepage. to reset, go to
          Admin Settings / Settings / General to disable it.
        </p>
        <DashboardSelector value={dashboard} onChange={setDashboard} />
      </ModalContent>
    </Modal>
  );
};

export default CustomHomePageModal;

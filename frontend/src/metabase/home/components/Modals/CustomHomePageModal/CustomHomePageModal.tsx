import React, { useState, useCallback } from "react";
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

interface CustomHomePageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CustomHomePageModal = ({
  isOpen,
  onClose,
}: CustomHomePageModalProps) => {
  const [dashboard, setDashboard] = useState<DashboardId>();
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

  const handleChange = useCallback(
    (value: number | null | undefined | string) => {
      if (value) {
        setDashboard(value);
      } else {
        setDashboard(undefined);
      }
    },
    [setDashboard],
  );

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
        <p>{t`Pick one of your dashboards to serve as homepage. Users wihtout dashboard access will be directed to the default homepage. You can update or reset this anytime in Admin Settings > Settings > General`}</p>
        <DashboardSelector
          value={dashboard}
          onChange={handleChange}
          collectionFilter={(collection: Collection) =>
            collection.personal_owner_id === null || collection.id === "root"
          }
        />
      </ModalContent>
    </Modal>
  );
};

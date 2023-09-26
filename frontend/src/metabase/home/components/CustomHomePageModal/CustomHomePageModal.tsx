import { useState, useCallback } from "react";
import { t } from "ttag";

import { Box, Text } from "metabase/ui";

import { useDispatch } from "metabase/lib/redux";
import { updateSettings } from "metabase/admin/settings/settings";
import { trackCustomHomepageDashboardEnabled } from "metabase/admin/settings/analytics";
import { refreshCurrentUser } from "metabase/redux/user";
import { addUndo, dismissUndo } from "metabase/redux/undo";

import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

import { DashboardSelector } from "metabase/components/DashboardSelector/DashboardSelector";
import Button from "metabase/core/components/Button/Button";
import { isPersonalCollectionOrChild } from "metabase/collections/utils";

import type { Collection, DashboardId } from "metabase-types/api";

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

    const id = Date.now();
    await dispatch(
      addUndo({
        message: () => (
          <Box ml="0.5rem" mr="2.5rem">
            <Text
              span
              fw={700}
            >{t`This dashboard has been set as your homepage.`}</Text>
            <br />
            <Text
              span
            >{t`You can change this in Admin > Settings > General.`}</Text>
          </Box>
        ),
        icon: "info",
        timeout: 10000,
        id,
        actions: [dismissUndo(id)],
        actionLabel: "Got it",
        canDismiss: false,
      }),
    );
    await dispatch(refreshCurrentUser());
    trackCustomHomepageDashboardEnabled("homepage");
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
        title={t`Customize Homepage`}
        onClose={handleClose}
        footer={[
          <Button onClick={handleClose} key="custom-homepage-modal-cancel">
            {t`Cancel`}
          </Button>,
          <Button
            primary
            onClick={handleSave}
            key="custom-homepage-modal-save"
            disabled={!dashboardId}
          >
            {t`Save`}
          </Button>,
        ]}
      >
        <p>{t`Pick a dashboard to serve as the homepage. If people lack permissions to view the selected dashboard, Metabase will redirect them to the default homepage. You can update or reset the homepage at any time in Admin Settings > Settings > General.`}</p>
        <DashboardSelector
          value={dashboardId}
          onChange={handleChange}
          collectionFilter={(
            collection: Collection,
            _index: number,
            allCollections: Collection[],
          ) => !isPersonalCollectionOrChild(collection, allCollections)}
        />
      </ModalContent>
    </Modal>
  );
};

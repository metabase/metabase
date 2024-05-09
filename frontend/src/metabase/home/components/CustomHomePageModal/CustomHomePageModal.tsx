import { useState, useCallback } from "react";
import { t } from "ttag";

import { trackCustomHomepageDashboardEnabled } from "metabase/admin/settings/analytics";
import { updateSettings } from "metabase/admin/settings/settings";
import { DashboardSelector } from "metabase/components/DashboardSelector/DashboardSelector";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button/Button";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import { refreshCurrentUser } from "metabase/redux/user";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Text } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

const CUSTOM_HOMEPAGE_SETTING_KEY = "custom-homepage";
const CUSTOM_HOMEPAGE_DASHBOARD_SETTING_KEY = "custom-homepage-dashboard";
const CUSTOM_HOMEPAGE_REDIRECT_TOAST_KEY = "dismissed-custom-dashboard-toast";

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
              c="white"
              fw={700}
            >{t`This dashboard has been set as your homepage.`}</Text>
            <br />
            <Text
              span
              c="white"
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

  const applicationName = useSelector(getApplicationName);

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
        <p>{t`Pick a dashboard to serve as the homepage. If people lack permissions to view the selected dashboard, ${applicationName} will redirect them to the default homepage. You can update or reset the homepage at any time in Admin Settings > Settings > General.`}</p>
        <DashboardSelector value={dashboardId} onChange={handleChange} />
      </ModalContent>
    </Modal>
  );
};

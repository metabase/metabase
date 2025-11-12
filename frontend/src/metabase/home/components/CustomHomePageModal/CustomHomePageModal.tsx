import { useCallback, useState } from "react";
import { jt, t } from "ttag";

import { trackCustomHomepageDashboardEnabled } from "metabase/admin/settings/analytics";
import { updateSettings } from "metabase/admin/settings/settings";
import { DashboardSelector } from "metabase/common/components/DashboardSelector/DashboardSelector";
import Link from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import { refreshCurrentUser } from "metabase/redux/user";
import { Box, Button, Flex, Modal, Text } from "metabase/ui";
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
              c="text-primary-inverse"
              fw={700}
            >{t`This dashboard has been set as your homepage.`}</Text>
            <Text
              span
              c="text-primary-inverse"
            >{t`You can change this in Admin > Settings > General.`}</Text>
          </Box>
        ),
        icon: "info",
        timeout: 10000,
        id,
        actions: [dismissUndo({ undoId: id })],
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
    <Modal
      title={t`Pick a dashboard to appear on the homepage`}
      opened={isOpen}
      onClose={handleClose}
      size="544px"
    >
      <Box mt="sm">
        <Text>
          {t`If anyone lacks permission to see the dashboard you pick, they'll be redirected to the default homepage.`}
        </Text>
        <Text mt="sm">{jt`You can always change the homepage in ${(<Link key="link" className={CS.link} to="/admin/settings/general" style={{ textDecoration: "underline" }}>{t`admin settings`}</Link>)} under General.`}</Text>
        <Box mt="lg">
          <DashboardSelector
            value={dashboardId}
            fullWidth={false}
            onChange={handleChange}
          />
        </Box>
      </Box>

      <Flex mt="lg" justify="flex-end" gap="0.5rem">
        <Button variant="subtle" onClick={handleClose}>
          {t`Cancel`}
        </Button>
        <Button variant="filled" disabled={!dashboardId} onClick={handleSave}>
          {t`Done`}
        </Button>
      </Flex>
    </Modal>
  );
};

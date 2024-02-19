import type { PlainRoute, InjectedRouter } from "react-router";
import type { Location } from "history";
import { useEffect, useState } from "react";
import { t } from "ttag";
import { withRouter } from "react-router";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";

interface RefreshConfirmationModalProps {
  router: InjectedRouter;
  routes: PlainRoute[];
  isEnabled: boolean;
}

export const RefreshConfirmationModal = withRouter(
  function RefreshConfirmationModal({
    router,
    routes,
    isEnabled,
  }: RefreshConfirmationModalProps) {
    const leafRoute = routes.at(-1);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isReloadScheduled, setIsReloadScheduled] = useState(false);
    const [isNavigationScheduled, setIsNavigationScheduled] = useState(false);
    const [nextLocation, setNextLocation] = useState<Location>();
    const isConfirmed = isReloadScheduled || isNavigationScheduled;

    useEffect(() => {
      const removeLeaveHook = router.setRouteLeaveHook(leafRoute, location => {
        if (isEnabled && !isConfirmed && !isBeforeUnload(location)) {
          setIsModalOpen(true);
          setNextLocation(location);
          return false;
        }
      });

      return removeLeaveHook;
    }, [isConfirmed, isEnabled, leafRoute, router]);

    useEffect(() => {
      if (nextLocation && isReloadScheduled) {
        router.push(nextLocation);
        location.reload();
      }

      if (nextLocation && isNavigationScheduled) {
        router.push(nextLocation);
      }
    }, [isNavigationScheduled, isReloadScheduled, nextLocation, router]);

    return (
      <Modal
        opened={isModalOpen}
        zIndex={5}
        onClose={() => setIsNavigationScheduled(true)}
        title={t`Refresh the page?`}
      >
        <Stack>
          <Text>{t`You need to refresh your browser to see your changes take effect. You can also close this modal and refresh the page later.`}</Text>
          <Group position="right">
            <Button
              variant="filled"
              onClick={() => setIsReloadScheduled(true)}
            >{t`Refresh now`}</Button>
          </Group>
        </Stack>
      </Modal>
    );
  },
);

function isBeforeUnload(location?: Location) {
  return !location;
}

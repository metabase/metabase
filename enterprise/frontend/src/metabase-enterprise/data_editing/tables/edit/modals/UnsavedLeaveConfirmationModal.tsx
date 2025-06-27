import type { Location } from "history";
import {
  type InjectedRouter,
  type Route,
  type RouterProps,
  withRouter,
} from "react-router";
import { t } from "ttag";

import useBeforeUnload from "metabase/common/hooks/use-before-unload";
import { useConfirmRouteLeaveModal } from "metabase/common/hooks/use-confirm-route-leave-modal";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";

type UnsavedLeaveConfirmationModalProps = {
  router: RouterProps;
  isUpdating: boolean;
  isDeleting: boolean;
  isInserting: boolean;
  isLocationAllowed?: (location: Location | undefined) => boolean;
};

export const UnsavedLeaveConfirmationModal = withRouter(
  ({
    router,
    isUpdating,
    isDeleting,
    isInserting,
    isLocationAllowed,
  }: UnsavedLeaveConfirmationModalProps) => {
    const isLoading = isUpdating || isDeleting || isInserting;
    const routes = router.routes as Route[];
    const currentRoute = routes[routes.length - 1];

    useBeforeUnload(isLoading);
    const { opened, close, confirm } = useConfirmRouteLeaveModal({
      isEnabled: isLoading,
      router: router as InjectedRouter,
      route: currentRoute,
      isLocationAllowed,
    });

    return (
      <Modal
        size="md"
        title={t`Unsaved changes`}
        opened={opened}
        onClose={close}
      >
        <Stack gap="xl">
          <Text>{t`Leaving this page may result in losing your changes.`}</Text>
          <Group justify="flex-end">
            <Button variant="filled" color="danger" onClick={confirm}>
              {t`Leave anyway`}
            </Button>
          </Group>
        </Stack>
      </Modal>
    );
  },
);

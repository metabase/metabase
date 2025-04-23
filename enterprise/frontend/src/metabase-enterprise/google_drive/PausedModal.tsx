import { t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Button, Modal, Stack, Text } from "metabase/ui";

import databaseError from "./database-error.svg?component";

export function PausedModal({
  onClose,
}: {
  onClose: () => void;
  reconnect: boolean;
}) {
  const isAdmin = useSelector(getUserIsAdmin);

  return (
    <Modal opened onClose={onClose} padding="xl" withCloseButton={false}>
      <Stack gap="md" pt="lg" ta="center">
        <Box component={databaseError} mx="auto" />
        <Text size="lg" fw="bold">
          {t`Couldn't upload the file, storage is full`}
        </Text>
        <Text c="text-medium">
          {isAdmin
            ? // eslint-disable-next-line no-literal-metabase-strings -- admin only
              t`Add more storage to your Metabase or connect a database to store the uploaded files.`
            : t`Please contact your admin to add more storage.`}
        </Text>

        <Stack w="50%" my="lg" mx="auto">
          {isAdmin ? (
            <>
              <Button
                variant="filled"
                component={ExternalLink}
                href="https://store.metabase.com"
                target="_blank"
              >
                {t`Add more storage`}
              </Button>
              <Button onClick={onClose}>{t`Cancel`}</Button>
            </>
          ) : (
            <Button variant="filled" onClick={onClose}>
              {t`OK`}
            </Button>
          )}
        </Stack>
      </Stack>
    </Modal>
  );
}

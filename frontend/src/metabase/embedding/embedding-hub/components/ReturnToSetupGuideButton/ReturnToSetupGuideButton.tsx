import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";

/**
 * Only allow relative paths to prevent open redirect via ?returnTo=.
 */
function getSafeReturnTo(returnTo: string): string | null {
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return null;
}

interface ReturnToSetupGuideModalProps {
  returnTo: string;
  opened: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
}

/**
 * Modal that prompts the user to return to the embedding setup guide
 * after completing an action (e.g. adding a database, saving an x-ray dashboard).
 */
export const ReturnToSetupGuideModal = ({
  returnTo,
  opened,
  onClose,
  title = t`You're all set!`,
  message = t`Go back to the setup guide to continue setting up embedding.`,
}: ReturnToSetupGuideModalProps) => {
  const dispatch = useDispatch();
  const safePath = getSafeReturnTo(returnTo);

  if (!safePath) {
    return null;
  }

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="md">
      <Stack>
        <Text>{message}</Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            {t`Stay here`}
          </Button>
          <Button variant="filled" onClick={() => dispatch(push(safePath))}>
            {t`Return to the setup guide`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

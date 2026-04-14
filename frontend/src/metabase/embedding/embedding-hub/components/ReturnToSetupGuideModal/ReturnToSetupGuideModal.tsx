import { push } from "react-router-redux";
import { t } from "ttag";

import { EMBEDDING_SETUP_GUIDE_PATH } from "metabase/embedding/embedding-hub/constants";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";

interface ReturnToSetupGuideModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

/**
 * Modal that prompts the user to return to the embedding setup guide
 * after completing an action (e.g. adding a database, saving an x-ray dashboard).
 */
export const ReturnToSetupGuideModal = ({
  opened,
  onClose,
  title,
  message,
}: ReturnToSetupGuideModalProps) => {
  const dispatch = useDispatch();

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="md">
      <Stack>
        <Text>{message}</Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            {t`Stay here`}
          </Button>
          <Button
            variant="filled"
            onClick={() => dispatch(push(EMBEDDING_SETUP_GUIDE_PATH))}
          >
            {t`Return to the setup guide`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

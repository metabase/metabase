import { t } from "ttag";

import { useNavigate } from "metabase/router";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";

// Fallback for callers that did not say where they came from. Inlined here
// rather than imported so this modal can live at the shared tier and be invoked
// from anywhere without a cross-feature dependency.
const DEFAULT_SETUP_GUIDE_PATH = "/admin/embedding/setup-guide";

interface ReturnToSetupGuideModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  message: string;
  /** Where to send the user back to. The guide has more than one host. */
  returnTo?: string;
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
  returnTo = DEFAULT_SETUP_GUIDE_PATH,
}: ReturnToSetupGuideModalProps) => {
  const navigate = useNavigate();

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="md">
      <Stack>
        <Text>{message}</Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            {t`Stay here`}
          </Button>
          <Button variant="filled" onClick={() => navigate(returnTo)}>
            {t`Return to the setup guide`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

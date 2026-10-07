import { t } from "ttag";

import { useNavigate } from "metabase/router";
import { Button, Modal, Text } from "metabase/ui";

// Path to the admin embedding setup guide. Inlined here (rather than
// imported from admin/) so this modal can live at the shared tier and be
// invoked from dashboard/admin/etc. without a cross-feature dependency.
const EMBEDDING_SETUP_GUIDE_PATH = "/admin/embedding/setup-guide";

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
  const navigate = useNavigate();

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="md">
      <Text>{message}</Text>
      <Modal.Footer>
        <Button variant="subtle" onClick={onClose}>
          {t`Stay here`}
        </Button>
        <Button
          variant="filled"
          onClick={() => navigate(EMBEDDING_SETUP_GUIDE_PATH)}
        >
          {t`Return to the setup guide`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

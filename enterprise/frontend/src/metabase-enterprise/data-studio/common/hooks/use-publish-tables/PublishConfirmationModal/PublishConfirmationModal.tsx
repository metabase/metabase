import { type ChangeEvent, useState } from "react";
import { t } from "ttag";

import { Box, Button, Checkbox, Group, Modal, Text, rem } from "metabase/ui";

type PublishConfirmationModalProps = {
  isOpened: boolean;
  onSubmit: (isAcknowledged: boolean) => void;
  onClose: () => void;
};

export function PublishConfirmationModal({
  isOpened,
  onSubmit,
  onClose,
}: PublishConfirmationModalProps) {
  const [isAcknowledged, setIsAcknowledged] = useState(false);

  return (
    <Modal
      opened={isOpened}
      padding="xl"
      size={rem(512)}
      title={t`What publishing a table does`}
      onClose={onClose}
    >
      <Text pt="sm">
        {t`Publishing a table means placing it in a collection in the Library so that it’s easy for your end users to find and use it in their explorations.`}
      </Text>

      <Group pt="xl" justify="space-between">
        <Box>
          <Checkbox
            label={t`Don’t show this to me again`}
            checked={isAcknowledged}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setIsAcknowledged(event.target.checked)
            }
          />
        </Box>
        <Button onClick={() => onSubmit(isAcknowledged)} variant="filled">
          {t`Publish`}
        </Button>
      </Group>
    </Modal>
  );
}

import { type ChangeEvent, useState } from "react";
import { t } from "ttag";

import { Box, Button, Checkbox, Group, Modal, Text, rem } from "metabase/ui";

type PublishAcknowledgementModalProps = {
  isOpened: boolean;
  onSubmit: (isAcknowledged: boolean) => void;
  onClose: () => void;
};

export function PublishAcknowledgementModal({
  isOpened,
  onSubmit,
  onClose,
}: PublishAcknowledgementModalProps) {
  return (
    <Modal
      title={t`What publishing a table does`}
      size={rem(512)}
      padding="xl"
      opened={isOpened}
      onClose={onClose}
    >
      <ModalBody onSubmit={onSubmit} />
    </Modal>
  );
}

type ModalBodyProps = {
  onSubmit: (isAcknowledged: boolean) => void;
};

function ModalBody({ onSubmit }: ModalBodyProps) {
  const [isAcknowledged, setIsAcknowledged] = useState(false);

  return (
    <>
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
    </>
  );
}

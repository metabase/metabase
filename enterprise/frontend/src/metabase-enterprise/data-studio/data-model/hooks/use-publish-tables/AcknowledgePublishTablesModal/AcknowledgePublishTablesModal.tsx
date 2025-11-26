import { type ChangeEvent, useState } from "react";
import { t } from "ttag";

import { Box, Button, Checkbox, Group, Modal, Text, rem } from "metabase/ui";

type AcknowledgePublishTablesModalProps = {
  onSubmit: (isAcknowledged: boolean) => void;
  onClose: () => void;
};

export function AcknowledgePublishTablesModal({
  onSubmit,
  onClose,
}: AcknowledgePublishTablesModalProps) {
  const [isAcknowledged, setIsAcknowledged] = useState(false);

  return (
    <Modal
      opened
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
          {t`Got it`}
        </Button>
      </Group>
    </Modal>
  );
}

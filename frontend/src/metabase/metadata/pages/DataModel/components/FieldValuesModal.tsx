import { t } from "ttag";

import {
  DiscardFieldValuesButton,
  RescanFieldButton,
} from "metabase/metadata/components";
import { Modal, Stack, Text, rem } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

interface Props {
  fieldId: FieldId;
  isOpen: boolean;
  onClose: () => void;
}

export const FieldValuesModal = ({ fieldId, isOpen, onClose }: Props) => {
  return (
    <Modal
      opened={isOpen}
      padding="xl"
      size={rem(512)}
      title={t`Field values`}
      onClose={onClose}
    >
      <Stack gap="md" pt="sm">
        <Text c="text-secondary" size="sm">
          {/* eslint-disable-next-line no-literal-metabase-strings -- Admin settings */}
          {t`Metabase can scan the values in this table to enable checkbox filters in dashboards and questions.`}
        </Text>

        <RescanFieldButton fieldId={fieldId} />

        <DiscardFieldValuesButton fieldId={fieldId} />
      </Stack>
    </Modal>
  );
};

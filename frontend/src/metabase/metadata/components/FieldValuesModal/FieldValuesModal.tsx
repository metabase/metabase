import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Modal, Stack, Text, rem } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

import { DiscardFieldValuesButton } from "../DiscardFieldValuesButton";
import { RescanFieldButton } from "../RescanFieldButton";

type FieldValuesModalProps = {
  fieldId: FieldId;
  isOpen: boolean;
  onClose: () => void;
};

export const FieldValuesModal = ({
  fieldId,
  isOpen,
  onClose,
}: FieldValuesModalProps) => {
  const applicationName = useSelector(getApplicationName);

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
          {t`${applicationName} can scan the values in this table to enable checkbox filters in dashboards and questions.`}
        </Text>

        <RescanFieldButton fieldId={fieldId} />

        <DiscardFieldValuesButton fieldId={fieldId} />
      </Stack>
    </Modal>
  );
};

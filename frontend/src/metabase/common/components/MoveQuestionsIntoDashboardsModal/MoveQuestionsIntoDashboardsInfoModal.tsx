import { t } from "ttag";

import { Button, Flex, Icon, List, Modal } from "metabase/ui";

interface MoveQuestionsIntoDashboardsInfoModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export const MoveQuestionsIntoDashboardsInfoModal = ({
  onConfirm,
  onCancel,
}: MoveQuestionsIntoDashboardsInfoModalProps) => (
  <Modal
    opened
    onClose={onCancel}
    title={t`Move questions into their dashboards?`}
    size="35rem"
    withCloseButton={false}
    data-testid="move-questions-into-dashboard-info-modal"
  >
    <List spacing="md" mt="1.25rem">
      <List.Item
        icon={<Icon name="collection" c="brand" mb="-2px" />}
        lh="1.5rem"
      >
        {t`If a question only appears in a single dashboard in this collection, it'll be moved into that dashboard to declutter the collection.`}
      </List.Item>
      <List.Item icon={<Icon name="group" c="brand" mb="-2px" />} lh="1.5rem">
        {t`Permissions won’t change.`}
      </List.Item>
    </List>

    <Flex justify="flex-end" gap="md" pt="1rem">
      <Button variant="subtle" onClick={onCancel}>{t`Cancel`}</Button>
      <Button variant="filled" onClick={onConfirm}>
        {t`Preview the changes`}
      </Button>
    </Flex>
  </Modal>
);

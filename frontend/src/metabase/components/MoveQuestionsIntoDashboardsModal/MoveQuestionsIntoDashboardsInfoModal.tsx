import { t } from "ttag";
import _ from "underscore";

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
    title={t`Move saved questions into dashboards?`}
    size="35rem"
    withCloseButton={false}
  >
    <List spacing="md" mt="1.25rem">
      <List.Item icon={<Icon name="ai" c="brand" />}>
        Instead of cluttering up this collection, each saved question will be
        moved into and stored inside of the dashboard it appears in.
      </List.Item>
      <List.Item icon={<Icon name="collection" c="brand" />}>
        We’ll only move questions in this collection that appear in a single
        dashboard in this collection.
      </List.Item>
      <List.Item icon={<Icon name="group" c="brand" />}>
        Permissions won’t be changed.
      </List.Item>
    </List>

    <Flex justify="flex-end" gap="md" pt="1rem">
      <Button variant="subtle" onClick={onCancel}>{t`Cancel`}</Button>
      <Button variant="filled" onClick={onConfirm}>
        {t`Preview what this will do`}
      </Button>
    </Flex>
  </Modal>
);

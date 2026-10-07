import { t } from "ttag";

import { Button, Flex, Modal, Text } from "metabase/ui";

interface AnonymousAccessChoiceModalProps {
  opened: boolean;
  /** Dismissing the question without answering it. Nothing changes. */
  onCancel: () => void;
  /** Called with the admin's answer. */
  onAnswer: (granted: boolean) => void;
}

/** Puts the anonymous-access grant to the admin as a choice. The caller applies the answer. */
export const AnonymousAccessChoiceModal = ({
  opened,
  onCancel,
  onAnswer,
}: AnonymousAccessChoiceModalProps) => (
  <Modal
    opened={opened}
    title={t`Keep serving anonymous visitors?`}
    size="lg"
    onClose={onCancel}
  >
    <Flex direction="column" gap="xl" mt="lg">
      <Text>
        {t`This database already serves anonymous visitors, through a public link or a published guest embed. They have no user attribute for routing to match on, so without anonymous access their queries stop returning data. Allowing it lets them keep querying this database.`}
      </Text>
      <Flex align="center" justify="space-between" gap="lg">
        <Button variant="subtle" onClick={onCancel}>{t`Cancel`}</Button>
        <Flex align="center" gap="lg">
          <Button onClick={() => onAnswer(false)}>
            {t`Stop serving them`}
          </Button>
          <Button
            variant="filled"
            data-autofocus
            onClick={() => onAnswer(true)}
          >
            {t`Keep serving them`}
          </Button>
        </Flex>
      </Flex>
    </Flex>
  </Modal>
);

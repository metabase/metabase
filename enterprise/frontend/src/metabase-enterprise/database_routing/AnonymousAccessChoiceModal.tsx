import { t } from "ttag";

import { Button, Flex, Modal, Text } from "metabase/ui";

interface AnonymousAccessChoiceModalProps {
  opened: boolean;
  /** Dismissing the question without answering it. Nothing changes. */
  onCancel: () => void;
  /** Whether anonymous visitors may keep querying this database. */
  onAnswer: (granted: boolean) => void;
}

/**
 * Puts the anonymous-access grant to the admin as a choice, for a database something anonymous already
 * reaches. The caller decides what the answer is applied to, so the same question can be asked before
 * routing is turned on and before an existing grant is taken away.
 */
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
            {t`Let them stop working`}
          </Button>
          <Button
            variant="filled"
            data-autofocus
            onClick={() => onAnswer(true)}
          >
            {t`Keep them working`}
          </Button>
        </Flex>
      </Flex>
    </Flex>
  </Modal>
);

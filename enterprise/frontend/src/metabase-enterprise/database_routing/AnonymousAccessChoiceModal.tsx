import { t } from "ttag";

import { Button, Flex, Modal, Text } from "metabase/ui";

/** Which question is being put about the anonymous-access grant. */
export type AnonymousAccessQuestion = "choose";

interface AnonymousAccessChoiceModalProps {
  /** The question being put, or null when none is. */
  question: AnonymousAccessQuestion | null;
  /** The open question, which has not been decided yet, so its answer goes either way. */
  onChooseGrant: (granted: boolean) => void | Promise<void>;
  onCancelGrantChoice: () => void;
}

/** Puts the anonymous-access grant to the admin. The caller applies the answer. */
export const AnonymousAccessChoiceModal = ({
  question,
  onChooseGrant,
  onCancelGrantChoice,
}: AnonymousAccessChoiceModalProps) => (
  <GrantChoiceModal
    opened={question === "choose"}
    onAnswer={onChooseGrant}
    onCancel={onCancelGrantChoice}
  />
);

const GrantChoiceModal = ({
  opened,
  onAnswer,
  onCancel,
}: {
  opened: boolean;
  onAnswer: (granted: boolean) => void | Promise<void>;
  onCancel: () => void;
}) => {
  const answer = async (granted: boolean) => {
    await onAnswer(granted);
  };

  return (
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
            <Button onClick={() => answer(false)}>
              {t`Stop serving them`}
            </Button>
            <Button
              variant="filled"
              data-autofocus
              onClick={() => answer(true)}
            >
              {t`Keep serving them`}
            </Button>
          </Flex>
        </Flex>
      </Flex>
    </Modal>
  );
};

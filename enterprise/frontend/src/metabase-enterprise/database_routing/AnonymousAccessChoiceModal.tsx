import type { ReactNode } from "react";
import { t } from "ttag";

import { Button, Flex, Modal, Text } from "metabase/ui";
import type { DatabaseAnonymousReach } from "metabase-types/api";

import { AnonymousReachList } from "./AnonymousReachList";

export type AnonymousAccessQuestion = "choose" | "revoke";

type Answer = () => void | Promise<void>;

interface AnonymousAccessChoiceModalProps {
  question: AnonymousAccessQuestion | null;
  reach: DatabaseAnonymousReach | undefined;
  onChooseGrant: (granted: boolean) => void | Promise<void>;
  onCancelGrantChoice: () => void;
  onConfirmRevoke: Answer;
  onDismissRevoke: () => void;
}

export const AnonymousAccessChoiceModal = ({
  question,
  reach,
  onChooseGrant,
  onCancelGrantChoice,
  onConfirmRevoke,
  onDismissRevoke,
}: AnonymousAccessChoiceModalProps) => {
  // Both stay mounted so Mantine can return focus on close.
  const modals: Record<AnonymousAccessQuestion, ReactNode> = {
    choose: (
      <GrantChoiceModal
        key="choose"
        opened={question === "choose"}
        reach={reach}
        onAnswer={onChooseGrant}
        onCancel={onCancelGrantChoice}
      />
    ),
    revoke: (
      <RevokeConfirmationModal
        key="revoke"
        opened={question === "revoke"}
        reach={reach}
        onConfirm={onConfirmRevoke}
        onCancel={onDismissRevoke}
      />
    ),
  };

  return <>{Object.values(modals)}</>;
};

const GrantChoiceModal = ({
  opened,
  reach,
  onAnswer,
  onCancel,
}: {
  opened: boolean;
  reach: DatabaseAnonymousReach | undefined;
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
        <AnonymousReachList
          reach={reach}
          framing="at-stake"
          variant="question"
        />
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

/** Not `ConfirmModal`: it wraps its message in a paragraph, which cannot hold a list. */
const RevokeConfirmationModal = ({
  opened,
  reach,
  onConfirm,
  onCancel,
}: {
  opened: boolean;
  reach: DatabaseAnonymousReach | undefined;
  onConfirm: Answer;
  onCancel: () => void;
}) => (
  <Modal
    opened={opened}
    title={t`Stop serving anonymous visitors?`}
    size="lg"
    onClose={onCancel}
  >
    <Flex direction="column" gap="xl" mt="lg">
      <Text>
        {t`This database serves anonymous visitors, through a public link or a published guest embed. They have no user attribute for routing to match on, so without anonymous access their queries stop returning data.`}
      </Text>
      <AnonymousReachList
        reach={reach}
        framing="would-stop"
        variant="question"
      />
      <Flex align="center" justify="flex-end" gap="lg">
        <Button data-autofocus onClick={onCancel}>{t`Cancel`}</Button>
        <Button color="negative" variant="filled" onClick={onConfirm}>
          {t`Stop serving them`}
        </Button>
      </Flex>
    </Flex>
  </Modal>
);

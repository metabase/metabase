import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Button, Flex, Modal, Text } from "metabase/ui";

/** Which question is being put about the anonymous-access grant. */
export type AnonymousAccessQuestion = "choose" | "revoke";

type Answer = () => void | Promise<void>;

interface AnonymousAccessChoiceModalProps {
  /** The question being put, or null when none is. */
  question: AnonymousAccessQuestion | null;
  /** The open question, which has not been decided yet, so its answer goes either way. */
  onChooseGrant: (granted: boolean) => void | Promise<void>;
  onCancelGrantChoice: () => void;
  /** The confirmation, which can only mean the revoke the admin already asked for. */
  onConfirmRevoke: Answer;
  onDismissRevoke: () => void;
}

/** Puts the anonymous-access grant to the admin. The caller applies the answer. */
export const AnonymousAccessChoiceModal = ({
  question,
  onChooseGrant,
  onCancelGrantChoice,
  onConfirmRevoke,
  onDismissRevoke,
}: AnonymousAccessChoiceModalProps) => {
  // All mounted, so Mantine can close one and hand focus back to what opened it.
  // The Record makes a new question a compile error until it has a modal here.
  const modals: Record<AnonymousAccessQuestion, ReactNode> = {
    choose: (
      <GrantChoiceModal
        key="choose"
        opened={question === "choose"}
        onAnswer={onChooseGrant}
        onCancel={onCancelGrantChoice}
      />
    ),
    revoke: (
      <ConfirmModal
        key="revoke"
        opened={question === "revoke"}
        title={t`Stop serving anonymous visitors?`}
        // either surface alone makes the fact true, so the copy disjoins them
        message={t`This database serves anonymous visitors, through a public link or a published guest embed. They have no user attribute for routing to match on, so without anonymous access their queries stop returning data.`}
        confirmButtonText={t`Stop serving them`}
        onConfirm={onConfirmRevoke}
        onClose={onDismissRevoke}
      />
    ),
  };

  return <>{Object.values(modals)}</>;
};

const GrantChoiceModal = ({
  opened,
  onAnswer,
  onCancel,
}: {
  opened: boolean;
  onAnswer: (granted: boolean) => void | Promise<void>;
  onCancel: () => void;
}) => {
  const [answering, setAnswering] = useState(false);

  const answer = async (granted: boolean) => {
    const applied = onAnswer(granted);
    try {
      if (applied instanceof Promise) {
        setAnswering(true);
        await applied;
      }
    } finally {
      setAnswering(false);
    }
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
            <Button disabled={answering} onClick={() => answer(false)}>
              {t`Stop serving them`}
            </Button>
            <Button
              variant="filled"
              data-autofocus
              disabled={answering}
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

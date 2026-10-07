import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Button, Flex, Modal, Text } from "metabase/ui";

/**
 * Which form the anonymous-access question takes.
 *
 * "choose" puts the grant to an admin who has not decided it yet, before a router is stored.
 * "revoke" confirms withdrawing a grant that is serving anonymous visitors right now.
 */
export type AnonymousAccessQuestion = "choose" | "revoke";

interface AnonymousAccessChoiceModalProps {
  /** The question being put, or null when none is. */
  question: AnonymousAccessQuestion | null;
  /** Dismissing the question without answering it. Nothing changes. */
  onCancel: () => void;
  /** Called with the admin's answer. */
  onAnswer: (granted: boolean) => void | Promise<void>;
}

/**
 * Puts the anonymous-access grant to the admin. The caller applies the answer.
 *
 * "choose" is an open question, asked before a router is stored: all three answers are live.
 * "revoke" confirms a withdrawal the admin has already asked for, so the only answer that
 * changes anything is the one they asked for, and the rest is Cancel.
 *
 * The two are separate modals rather than one with branching copy, so that each keeps its own
 * words while Mantine closes it and hands focus back to the control that opened it.
 *
 * Each body is one whole string rather than assembled from shared sentences, so that a
 * translator sees the paragraph they are translating.
 */
export const AnonymousAccessChoiceModal = ({
  question,
  onCancel,
  onAnswer,
}: AnonymousAccessChoiceModalProps) => (
  <>
    <ConfirmModal
      opened={question === "revoke"}
      title={t`Stop serving anonymous visitors?`}
      // either surface alone makes the fact true, so the copy names them as a disjunction
      message={t`This database serves anonymous visitors, through a public link or a published guest embed. They have no user attribute for routing to match on, so without anonymous access their queries stop returning data.`}
      confirmButtonText={t`Stop serving them`}
      onConfirm={() => onAnswer(false)}
      onClose={onCancel}
    />
    <Modal
      opened={question === "choose"}
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
  </>
);

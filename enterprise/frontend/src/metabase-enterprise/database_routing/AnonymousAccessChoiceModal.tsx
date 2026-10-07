import { t } from "ttag";

import { Button, Flex, Modal, Text } from "metabase/ui";

import type { AnonymousAccessQuestion } from "./DatabaseRoutingSection/useAnonymousAccessChoice";

interface AnonymousAccessChoiceModalProps {
  /** Which question is being put. Render this only while one is. */
  question: AnonymousAccessQuestion;
  /** Dismissing the question without answering it. Nothing changes. */
  onCancel: () => void;
  /** Called with the admin's answer. */
  onAnswer: (granted: boolean) => void;
}

/**
 * Puts the anonymous-access grant to the admin. The caller applies the answer.
 *
 * "choose" is an open question, asked before a router is stored: all three answers are live.
 * "revoke" confirms a withdrawal the admin has already asked for, so the only answer that
 * changes anything is the one they asked for; the rest is Cancel.
 *
 * Each question's body is one whole string rather than shared sentences, so that a translator
 * sees the paragraph they are translating.
 */
export const AnonymousAccessChoiceModal = ({
  question,
  onCancel,
  onAnswer,
}: AnonymousAccessChoiceModalProps) =>
  question === "revoke" ? (
    <Modal
      opened
      title={t`Stop serving anonymous visitors?`}
      size="lg"
      onClose={onCancel}
    >
      <Flex direction="column" gap="xl" mt="lg">
        <Text>
          {/* either surface alone makes the fact true, so the copy names them as a disjunction */}
          {t`This database serves anonymous visitors, through a public link or a published guest embed. They have no user attribute for routing to match on, so without anonymous access their queries stop returning data.`}
        </Text>
        <Flex align="center" justify="flex-end" gap="lg">
          <Button variant="subtle" onClick={onCancel}>{t`Cancel`}</Button>
          <Button
            color="negative"
            variant="filled"
            data-autofocus
            onClick={() => onAnswer(false)}
          >
            {t`Stop serving them`}
          </Button>
        </Flex>
      </Flex>
    </Modal>
  ) : (
    <Modal
      opened
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

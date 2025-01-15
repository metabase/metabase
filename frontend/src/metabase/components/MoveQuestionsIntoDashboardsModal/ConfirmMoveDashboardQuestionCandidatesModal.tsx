import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { Button, Flex, Modal } from "metabase/ui";

import { DashboardQuestionCandidatesTable } from "./DashboardQuestionCandidatesTable";

interface ConfirmMoveDashboardQuestionCandidatesModalProps {
  candidates: any[]; // TODO:
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export const ConfirmMoveDashboardQuestionCandidatesModal = ({
  candidates,
  onConfirm,
  onCancel,
}: ConfirmMoveDashboardQuestionCandidatesModalProps) => {
  return (
    <Modal.Root
      opened
      onClose={onCancel}
      data-testid="move-questions-into-dashboard-modal"
      size="64rem"
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header px="2.5rem" pt="2rem" pb="1.5rem">
          <Modal.Title fz="20px">
            {ngettext(
              msgid`Move this question into its dashboard?`,
              `Move these ${candidates.length} questions into their dashboards?`,
              candidates.length,
            )}
          </Modal.Title>
          <Modal.CloseButton data-testid="move-questions-into-dashboard-modal-close-btn" />
        </Modal.Header>
        <Modal.Body p="0">
          <DashboardQuestionCandidatesTable data={candidates} />
        </Modal.Body>

        <Flex justify="flex-end" gap="md" py="1rem" px="1.25rem">
          <Button variant="subtle" onClick={onCancel}>{t`Cancel`}</Button>
          <Button variant="filled" onClick={onConfirm}>
            {t`Move these questions`}
          </Button>
        </Flex>
      </Modal.Content>
    </Modal.Root>
  );
};

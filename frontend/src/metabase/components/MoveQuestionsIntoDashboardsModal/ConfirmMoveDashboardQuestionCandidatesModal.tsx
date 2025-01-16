import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { Button, Flex, Icon, Modal } from "metabase/ui";

import S from "./ConfirmMoveDashboardQuestionCandidatesModal.module.css";

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
  const rows = useMemo(
    () =>
      candidates.map((_, i) => ({
        id: i,
        questionName: `Question ${i}`,
        dashboardName: `Dashboard ${i}`,
      })),
    [candidates],
  );

  return (
    <Modal.Root
      opened
      onClose={onCancel}
      data-testid="move-questions-into-dashboard-modal"
      size="64rem"
    >
      <Modal.Overlay />
      <Modal.Content className={S.modal}>
        <Modal.Header
          px="2.5rem"
          pt="2rem"
          pb="1.5rem"
          className={S.modalHeader}
        >
          <Modal.Title fz="20px">
            {ngettext(
              msgid`Move this question into its dashboard?`,
              `Move these ${candidates.length} questions into their dashboards?`,
              candidates.length,
            )}
          </Modal.Title>
          <Modal.CloseButton data-testid="move-questions-into-dashboard-modal-close-btn" />
        </Modal.Header>
        <Modal.Body p="0" className={S.modalBody}>
          <div className={S.tableHeader}>
            <div className={S.tableRow}>
              <div className={S.column}>
                <Flex gap="sm" align="center">
                  <Icon name="folder" c="brand" />
                  {t`Saved Question`}
                </Flex>
              </div>
              <div className={S.column}>
                <Flex gap="sm" align="center">
                  <Icon name="dashboard" c="brand" />
                  {t`Dashboard it'll be moved to`}
                </Flex>
              </div>
            </div>
          </div>
          <div className={S.tbody}>
            {rows.map(row => (
              <div key={row.id} className={S.tableRow}>
                <div className={S.cell}>{row.questionName}</div>
                <div className={S.cell}>{row.dashboardName}</div>
              </div>
            ))}
          </div>
          <Flex
            className={S.modalFooter}
            justify="flex-end"
            gap="md"
            py="1rem"
            px="1.25rem"
          >
            <Button variant="subtle" onClick={onCancel}>{t`Cancel`}</Button>
            <Button variant="filled" onClick={onConfirm}>
              {t`Move these questions`}
            </Button>
          </Flex>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};

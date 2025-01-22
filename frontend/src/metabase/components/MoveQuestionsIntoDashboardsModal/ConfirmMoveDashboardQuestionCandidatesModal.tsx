import { useMemo } from "react";
import { P, match } from "ts-pattern";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { Button, Flex, Icon, Loader, Modal, Text } from "metabase/ui";
import type { GetCollectionDashboardQuestionCandidatesResult } from "metabase-types/api";

import S from "./ConfirmMoveDashboardQuestionCandidatesModal.module.css";

interface ConfirmMoveDashboardQuestionCandidatesModalProps {
  candidates:
    | GetCollectionDashboardQuestionCandidatesResult["data"]
    | undefined;
  isLoading: boolean;
  error: unknown;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export const ConfirmMoveDashboardQuestionCandidatesModal = ({
  candidates,
  isLoading,
  error,
  onConfirm,
  onCancel,
}: ConfirmMoveDashboardQuestionCandidatesModalProps) => {
  const rows = useMemo(() => {
    if (isLoading || error || !candidates) {
      return [];
    }

    return candidates.map(candidate => ({
      id: candidate.id,
      questionName: candidate.name,
      dashboardName: candidate.sole_dashboard_info.name,
    }));
  }, [isLoading, error, candidates]);

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
            {error || isLoading || rows.length === 0
              ? t`Move these questions into their dashboards?`
              : ngettext(
                  msgid`Move this question into its dashboard?`,
                  `Move these ${rows.length} questions into their dashboards?`,
                  rows.length,
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
            {match({ isLoading, error, rows })
              .with({ isLoading: true }, () => (
                <Flex justify="center" py="18.25rem">
                  <Loader size="xl" />
                </Flex>
              ))
              .with({ error: P.not(P.nullish) }, ({ error }) => {
                const defaultMsg = t`Something went wrong`;
                return (
                  <Flex justify="center" py="19rem">
                    <Text color="error" size="1.25rem" px="md">
                      {error instanceof Error
                        ? (error?.message ?? defaultMsg)
                        : defaultMsg}
                    </Text>
                  </Flex>
                );
              })
              .with({ rows: [] }, () => (
                <Flex justify="center" py="19rem">
                  <Text size="1.25rem" px="md" color="text-light">
                    {t`There's no questions to clean up! Looks like everything is in its place.`}
                  </Text>
                </Flex>
              ))
              .otherwise(() =>
                rows.map(row => (
                  <div key={row.id} className={S.tableRow}>
                    <div className={S.cell}>{row.questionName}</div>
                    <div className={S.cell}>{row.dashboardName}</div>
                  </div>
                )),
              )}
          </div>
          <Flex
            className={S.modalFooter}
            justify="flex-end"
            gap="md"
            py="1rem"
            px="1.25rem"
          >
            <Button variant="subtle" onClick={onCancel}>{t`Cancel`}</Button>
            <Button
              variant="filled"
              onClick={onConfirm}
              disabled={!!(isLoading || error)}
            >
              {t`Move these questions`}
            </Button>
          </Flex>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};

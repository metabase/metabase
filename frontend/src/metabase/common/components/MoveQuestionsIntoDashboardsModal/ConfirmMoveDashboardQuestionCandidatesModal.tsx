import { useMemo } from "react";
import { P, match } from "ts-pattern";
import { msgid, ngettext, t } from "ttag";

import { Button, Flex, Icon, Loader, Modal, Text } from "metabase/ui";
import type { GetCollectionDashboardQuestionCandidatesResult } from "metabase-types/api";

import S from "./ConfirmMoveDashboardQuestionCandidatesModal.module.css";

export interface ConfirmMoveDashboardQuestionCandidatesModalProps {
  candidates:
    | GetCollectionDashboardQuestionCandidatesResult["data"]
    | undefined;
  isLoading: boolean;
  fetchError: unknown;
  isMutating: boolean;
  mutationError: unknown;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export const ConfirmMoveDashboardQuestionCandidatesModal = ({
  candidates,
  isMutating,
  mutationError,
  isLoading,
  fetchError,
  onConfirm,
  onCancel,
}: ConfirmMoveDashboardQuestionCandidatesModalProps) => {
  const rows = useMemo(() => {
    if (isLoading || fetchError || !candidates) {
      return [];
    }

    return candidates.map((candidate) => ({
      id: candidate.id,
      questionName: candidate.name,
      dashboardName: candidate.sole_dashboard_info.name,
    }));
  }, [isLoading, fetchError, candidates]);

  const defaultErrMsg = t`Something went wrong`;

  const ctaDisabled = !!(
    isMutating ||
    isLoading ||
    fetchError ||
    rows.length === 0
  );

  return (
    <Modal
      opened
      onClose={onCancel}
      data-testid="move-questions-into-dashboard-modal"
      size="64rem"
      padding={0}
      title={
        fetchError || isLoading || rows.length === 0
          ? t`Move these questions into their dashboards?`
          : ngettext(
              msgid`Move this question into its dashboard?`,
              `Move these ${rows.length} questions into their dashboards?`,
              rows.length,
            )
      }
      classNames={{
        content: S.modal,
        header: S.modalHeader,
        body: S.modalBody,
      }}
      styles={{
        header: {
          paddingRight: "2.5rem", // Needed for increased specificity
        },
      }}
    >
      <div className={S.tableHeader}>
        <div className={S.tableRow}>
          <div className={S.column}>
            <Flex gap="sm" align="center">
              <Icon name="folder" c="brand" />
              {t`Question`}
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
        {match({ isLoading, fetchError, rows })
          .with({ isLoading: true }, () => (
            <Flex justify="center" py="18.25rem">
              <Loader size="xl" data-testid="loading-indicator" />
            </Flex>
          ))
          .with({ fetchError: P.not(P.nullish) }, ({ fetchError }) => {
            return (
              <Flex justify="center" py="19rem">
                <Text color="error" size="1.25rem" px="md">
                  {fetchError instanceof Error
                    ? (fetchError?.message ?? defaultErrMsg)
                    : defaultErrMsg}
                </Text>
              </Flex>
            );
          })
          .with({ rows: [] }, () => (
            <Flex justify="center" py="19rem">
              <Text size="1.25rem" px="md" color="text-tertiary">
                {t`There aren't any questions to move into dashboards. Looks like everything is in its place.`}
              </Text>
            </Flex>
          ))
          .otherwise(() =>
            rows.map((row) => (
              <div key={row.id} className={S.tableRow}>
                <div className={S.cell}>{row.questionName}</div>
                <div className={S.cell}>{row.dashboardName}</div>
              </div>
            )),
          )}
      </div>
      <Flex
        className={S.modalFooter}
        justify="space-between"
        align="center"
        gap="md"
        py="1rem"
        px="1.25rem"
      >
        {mutationError ? (
          <Text color="error">
            {mutationError instanceof Error
              ? (mutationError?.message ?? defaultErrMsg)
              : defaultErrMsg}
          </Text>
        ) : (
          <div />
        )}
        <Flex gap="md" ml="1.5rem">
          <Button variant="subtle" onClick={onCancel}>{t`Cancel`}</Button>
          <Button
            loading={isMutating}
            variant="filled"
            onClick={onConfirm}
            disabled={ctaDisabled}
            color={mutationError ? "error" : "brand"}
          >
            {t`Move these questions`}
          </Button>
        </Flex>
      </Flex>
    </Modal>
  );
};

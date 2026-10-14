import { msgid, ngettext, t } from "ttag";

import { BulkActionButton } from "metabase/common/components/BulkActionBar";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Box, Card, Flex, Text, Tooltip } from "metabase/ui";
import type {
  ContentDiagnosticsBaseFinding,
  ContentDiagnosticsFindingId,
} from "metabase-types/api";

import type { ContentDiagnosticsTab } from "../types";

import S from "./ContentDiagnosticsBulkActionsBar.module.css";
import { ContentDiagnosticsBulkDismissButton } from "./ContentDiagnosticsBulkDismissButton";
import { useBulkTrashConfirmation } from "./use-bulk-trash-confirmation";

type ContentDiagnosticsBulkActionsBarProps = {
  selectedFindings: readonly ContentDiagnosticsBaseFinding[];
  tab: ContentDiagnosticsTab;
  enableTrash?: boolean;
  onSettled: (
    failedFindingIds: ContentDiagnosticsFindingId[],
    settledFindingIds: ContentDiagnosticsFindingId[],
  ) => void;
};

export function ContentDiagnosticsBulkActionsBar({
  selectedFindings,
  tab,
  onSettled,
  enableTrash = true,
}: ContentDiagnosticsBulkActionsBarProps) {
  const count = selectedFindings.length;
  const { canTrash, actionLabel, open, confirmationProps } =
    useBulkTrashConfirmation({ selectedFindings, tab, enableTrash, onSettled });
  return (
    <>
      {count > 0 && (
        <Box
          pos="absolute"
          left="50%"
          bottom="var(--mantine-spacing-lg)"
          className={S.bulkActions}
          data-testid="content-diagnostics-bulk-actions"
        >
          <Card
            bg="tooltip-background"
            c="tooltip-text"
            py="md"
            px="lg"
            data-testid="toast-card"
          >
            <Flex align="center" justify="space-between" gap="xxxl">
              <Text c="tooltip-text">
                {ngettext(
                  msgid`${count} item selected`,
                  `${count} items selected`,
                  count,
                )}
              </Text>
              <Flex gap="sm" align="center">
                <ContentDiagnosticsBulkDismissButton
                  tab={tab}
                  findingIds={selectedFindings.map((finding) => finding.id)}
                  onDismiss={(ids) => onSettled([], ids)}
                />
                {enableTrash && (
                  <Tooltip
                    label={t`You don't have permission to delete some selected items.`}
                    disabled={canTrash}
                  >
                    <span>
                      <BulkActionButton
                        danger
                        disabled={!canTrash}
                        onClick={open}
                      >
                        {actionLabel}
                      </BulkActionButton>
                    </span>
                  </Tooltip>
                )}
              </Flex>
            </Flex>
          </Card>
        </Box>
      )}
      <ConfirmModal {...confirmationProps} />
    </>
  );
}

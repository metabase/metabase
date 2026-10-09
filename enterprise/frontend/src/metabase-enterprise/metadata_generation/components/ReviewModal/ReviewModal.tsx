import cx from "classnames";
import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useMetadataToasts } from "metabase/common/hooks";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Loader,
  Modal,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import {
  useApplyMetadataGenerationRunMutation,
  useDecideMetadataGenerationSuggestionsMutation,
  useListMetadataGenerationRunTablesQuery,
  useListMetadataGenerationSuggestionsQuery,
} from "metabase-enterprise/api";
import type {
  ConcreteTableId,
  MetadataGenerationApplyResult,
  MetadataGenerationDecisionRequest,
  MetadataGenerationRunId,
  MetadataGenerationRunTable,
  MetadataGenerationSuggestion,
} from "metabase-types/api";

import { getAttributeLabel } from "../../utils";

import S from "./ReviewModal.module.css";
import {
  type RunTotals,
  canAcceptSuggestion,
  canRejectSuggestion,
  formatSuggestionValue,
  getApplyFailureReasonLabel,
  getApplySummary,
  getBulkAcceptable,
  getConfidenceColor,
  getConfidenceLabel,
  getFieldLabel,
  getHumanSetAcceptable,
  getRejectable,
  getRunTotals,
  getSuggestionStatusColor,
  getSuggestionStatusLabel,
  getTableLabel,
  hasOpenDecisions,
  isHumanSet,
  isSuggestionDecidable,
} from "./utils";

type ReviewModalProps = {
  runId: MetadataGenerationRunId;
  opened: boolean;
  onClose: () => void;
};

export function ReviewModal({ runId, opened, onClose }: ReviewModalProps) {
  return (
    <Modal
      opened={opened}
      title={t`Review AI metadata`}
      size="90rem"
      onClose={onClose}
    >
      {opened && <ReviewContent runId={runId} />}
    </Modal>
  );
}

type Decide = (
  request: Omit<MetadataGenerationDecisionRequest, "run_id">,
) => Promise<void>;

function useDecide(runId: MetadataGenerationRunId) {
  const [decideSuggestions, { isLoading }] =
    useDecideMetadataGenerationSuggestionsMutation();
  const { sendErrorToast } = useMetadataToasts();

  const decide: Decide = async (request) => {
    const { error } = await decideSuggestions({ run_id: runId, ...request });
    if (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to save the decision`));
    }
  };

  return { decide, isDeciding: isLoading };
}

function ReviewContent({ runId }: { runId: MetadataGenerationRunId }) {
  const {
    data: tables,
    error,
    isLoading,
  } = useListMetadataGenerationRunTablesQuery(runId);
  const [selectedTableId, setSelectedTableId] =
    useState<ConcreteTableId | null>(null);
  const [applyResult, setApplyResult] =
    useState<MetadataGenerationApplyResult | null>(null);
  const { decide, isDeciding } = useDecide(runId);

  if (error) {
    return <Text c="error">{getErrorMessage(error)}</Text>;
  }
  if (isLoading || tables == null) {
    return <Loader size="sm" />;
  }
  if (tables.length === 0) {
    return <Text>{t`This run has no suggestions.`}</Text>;
  }

  const selectedTable =
    tables.find((table) => table.table_id === selectedTableId) ??
    tables.find(hasOpenDecisions) ??
    tables[0];

  return (
    <Stack gap="md" data-testid="metadata-generation-review">
      <RunHeader
        runId={runId}
        totals={getRunTotals(tables)}
        isDeciding={isDeciding}
        decide={decide}
        onApply={setApplyResult}
      />
      {applyResult && (
        <ApplyResult
          result={applyResult}
          onDismiss={() => setApplyResult(null)}
        />
      )}
      <Flex gap="md" h="65vh" mih={0}>
        <ScrollArea className={S.tableList}>
          <TableList
            tables={tables}
            selectedTableId={selectedTable.table_id}
            onSelect={setSelectedTableId}
          />
        </ScrollArea>
        <Box flex={1} miw={0}>
          <TableReview
            key={selectedTable.table_id}
            runId={runId}
            table={selectedTable}
            isDeciding={isDeciding}
            decide={decide}
          />
        </Box>
      </Flex>
    </Stack>
  );
}

type RunHeaderProps = {
  runId: MetadataGenerationRunId;
  totals: RunTotals;
  isDeciding: boolean;
  decide: Decide;
  onApply: (result: MetadataGenerationApplyResult) => void;
};

function RunHeader({
  runId,
  totals,
  isDeciding,
  decide,
  onApply,
}: RunHeaderProps) {
  const [applyRun, { isLoading: isApplying }] =
    useApplyMetadataGenerationRunMutation();
  const { sendErrorToast } = useMetadataToasts();
  const { counts, humanSetPending } = totals;

  const handleApply = async () => {
    const { data, error } = await applyRun({ run_id: runId });
    if (error) {
      sendErrorToast(
        getErrorMessage(error, t`Failed to apply the suggestions`),
      );
    } else if (data) {
      onApply(data);
    }
  };

  return (
    <Group justify="space-between" wrap="nowrap" align="flex-start">
      <Stack gap={4}>
        <Group gap="xs" data-testid="metadata-generation-review-totals">
          <StatusCount label={t`Pending`} count={counts.pending} />
          <StatusCount label={t`Accepted`} count={counts.accepted} />
          <StatusCount label={t`Rejected`} count={counts.rejected} />
          <StatusCount label={t`Stale`} count={counts.stale} />
          <StatusCount label={t`Applied`} count={counts.applied} />
        </Group>
        {humanSetPending > 0 && (
          <Text size="sm" c="text-secondary">
            {ngettext(
              msgid`${humanSetPending} suggestion would replace a value a person set. Accept it one by one.`,
              `${humanSetPending} suggestions would replace values a person set. Accept them one by one.`,
              humanSetPending,
            )}
          </Text>
        )}
      </Stack>
      <Group gap="sm" wrap="nowrap">
        <Tooltip
          label={t`Accepts every pending and rejected suggestion, except those that would replace a value a person set.`}
        >
          <Button
            variant="default"
            disabled={counts.pending + counts.rejected === 0 || isDeciding}
            onClick={() => decide({ decision: "accept", all: true })}
          >
            {t`Accept all`}
          </Button>
        </Tooltip>
        <Button
          variant="filled"
          loading={isApplying}
          disabled={counts.accepted === 0}
          onClick={handleApply}
        >
          {t`Apply ${counts.accepted} accepted`}
        </Button>
      </Group>
    </Group>
  );
}

function StatusCount({ label, count }: { label: string; count: number }) {
  return (
    <Text size="sm" span>
      {label}: <strong>{count}</strong>
    </Text>
  );
}

type ApplyResultProps = {
  result: MetadataGenerationApplyResult;
  onDismiss: () => void;
};

function ApplyResult({ result, onDismiss }: ApplyResultProps) {
  return (
    <Stack
      gap="xs"
      p="md"
      bd="1px solid var(--mb-color-border-neutral)"
      bdrs="sm"
      data-testid="metadata-generation-apply-result"
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Icon
            name={result.failed > 0 ? "warning" : "check"}
            c={result.failed > 0 ? "warning" : "success"}
          />
          <Text fw="bold">{getApplySummary(result)}</Text>
        </Group>
        <ActionIcon aria-label={t`Dismiss`} onClick={onDismiss}>
          <Icon name="close" />
        </ActionIcon>
      </Group>
      {result.failures.length > 0 && (
        <Stack gap={2}>
          <Text size="sm" c="text-secondary">
            {t`Failed suggestions stay accepted, so you can apply them again after you fix the cause.`}
          </Text>
          {result.failures.map((failure) => (
            <Text key={failure.suggestion_id} size="sm">
              {t`Field ${failure.field_id}, ${getAttributeLabel(failure.attribute)}: ${getApplyFailureReasonLabel(failure.reason)}`}
            </Text>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

type TableListProps = {
  tables: MetadataGenerationRunTable[];
  selectedTableId: ConcreteTableId;
  onSelect: (tableId: ConcreteTableId) => void;
};

function TableList({ tables, selectedTableId, onSelect }: TableListProps) {
  return (
    <Stack gap={2} data-testid="metadata-generation-review-tables">
      {tables.map((table) => (
        <NavLink
          key={table.table_id}
          active={table.table_id === selectedTableId}
          label={getTableLabel(table)}
          description={getTableCountsLabel(table)}
          rightSection={
            table.human_set_pending > 0 ? (
              <Tooltip
                label={ngettext(
                  msgid`${table.human_set_pending} value set by a person needs a decision`,
                  `${table.human_set_pending} values set by a person need a decision`,
                  table.human_set_pending,
                )}
              >
                <Icon name="person" c="warning" aria-hidden={false} />
              </Tooltip>
            ) : undefined
          }
          onClick={() => onSelect(table.table_id)}
        />
      ))}
    </Stack>
  );
}

function getTableCountsLabel(table: MetadataGenerationRunTable): string {
  const { pending, accepted, rejected, stale, applied } = table.counts;
  const parts = [
    pending > 0 && t`${pending} pending`,
    accepted > 0 && t`${accepted} accepted`,
    rejected > 0 && t`${rejected} rejected`,
    stale > 0 && t`${stale} stale`,
    applied > 0 && t`${applied} applied`,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

type TableReviewProps = {
  runId: MetadataGenerationRunId;
  table: MetadataGenerationRunTable;
  isDeciding: boolean;
  decide: Decide;
};

function TableReview({ runId, table, isDeciding, decide }: TableReviewProps) {
  const {
    data: suggestions,
    error,
    isLoading,
  } = useListMetadataGenerationSuggestionsQuery({
    run_id: runId,
    table_id: table.table_id,
  });

  if (error) {
    return <Text c="error">{getErrorMessage(error)}</Text>;
  }
  if (isLoading || suggestions == null) {
    return <Loader size="sm" />;
  }

  const bulkAcceptable = getBulkAcceptable(suggestions);
  const humanSetAcceptable = getHumanSetAcceptable(suggestions);
  const rejectable = getRejectable(suggestions);

  return (
    <Stack gap="sm" h="100%" mih={0}>
      <Group justify="space-between" wrap="nowrap">
        <Text fw="bold" truncate>
          {getTableLabel(table)}
        </Text>
        <Group gap="sm" wrap="nowrap">
          {humanSetAcceptable.length > 0 && (
            <Tooltip
              label={t`Replaces the values a person set with the AI suggestions.`}
            >
              <Button
                variant="default"
                c="warning"
                disabled={isDeciding}
                onClick={() =>
                  decide({
                    decision: "accept",
                    suggestion_ids: humanSetAcceptable.map((s) => s.id),
                  })
                }
              >
                {ngettext(
                  msgid`Accept ${humanSetAcceptable.length} value set by a person`,
                  `Accept ${humanSetAcceptable.length} values set by a person`,
                  humanSetAcceptable.length,
                )}
              </Button>
            </Tooltip>
          )}
          <Button
            variant="default"
            disabled={rejectable.length === 0 || isDeciding}
            onClick={() =>
              decide({ decision: "reject", table_ids: [table.table_id] })
            }
          >
            {t`Reject table`}
          </Button>
          <Button
            variant="default"
            disabled={bulkAcceptable.length === 0 || isDeciding}
            onClick={() =>
              decide({ decision: "accept", table_ids: [table.table_id] })
            }
          >
            {t`Accept table`}
          </Button>
        </Group>
      </Group>
      <ScrollArea flex={1}>
        <table
          className={S.suggestions}
          data-testid="metadata-generation-suggestions"
        >
          <thead>
            <tr>
              <th>{t`Field`}</th>
              <th>{t`Attribute`}</th>
              <th>{t`Current`}</th>
              <th>{t`Proposed`}</th>
              <th>{t`Confidence`}</th>
              <th>{t`Decision`}</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((suggestion, index) => (
              <SuggestionRow
                key={suggestion.id}
                suggestion={suggestion}
                isFirstOfField={
                  index === 0 ||
                  suggestions[index - 1].field_id !== suggestion.field_id
                }
                isDeciding={isDeciding}
                decide={decide}
              />
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </Stack>
  );
}

type SuggestionRowProps = {
  suggestion: MetadataGenerationSuggestion;
  isFirstOfField: boolean;
  isDeciding: boolean;
  decide: Decide;
};

function SuggestionRow({
  suggestion,
  isFirstOfField,
  isDeciding,
  decide,
}: SuggestionRowProps) {
  const humanSet = isHumanSet(suggestion);
  const isConflict = humanSet && isSuggestionDecidable(suggestion);
  const current = formatSuggestionValue(
    suggestion.attribute,
    suggestion.current_value,
  );
  const proposed = formatSuggestionValue(
    suggestion.attribute,
    suggestion.proposed_value,
  );

  return (
    <tr
      className={cx({ [S.humanSet]: isConflict })}
      data-testid="metadata-generation-suggestion"
    >
      <td>
        {isFirstOfField && <Text fw="bold">{getFieldLabel(suggestion)}</Text>}
      </td>
      <td>
        <Text>{getAttributeLabel(suggestion.attribute)}</Text>
      </td>
      <td className={S.value}>
        <Stack gap={4} align="flex-start">
          {current != null ? (
            <Text>{current}</Text>
          ) : (
            <Text c="text-tertiary">{t`Empty`}</Text>
          )}
          {humanSet && (
            <Badge variant="light" color="warning">{t`Set by a person`}</Badge>
          )}
          {suggestion.source === "ai" && (
            <Badge variant="light" color="neutral">{t`Set by AI`}</Badge>
          )}
        </Stack>
      </td>
      <td className={S.value}>
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <Text>{proposed}</Text>
          {suggestion.reasoning && (
            <Tooltip label={suggestion.reasoning} maw="25rem" multiline>
              <Icon
                className={S.noShrink}
                name="info"
                c="text-secondary"
                aria-label={t`Reasoning`}
                aria-hidden={false}
              />
            </Tooltip>
          )}
        </Group>
      </td>
      <td>
        {suggestion.confidence && (
          <Badge
            variant="light"
            color={getConfidenceColor(suggestion.confidence)}
          >
            {getConfidenceLabel(suggestion.confidence)}
          </Badge>
        )}
      </td>
      <td className={S.decision}>
        <Group gap="xs" wrap="nowrap">
          <Badge
            className={S.noShrink}
            variant="light"
            color={getSuggestionStatusColor(suggestion.status)}
            data-testid="metadata-generation-suggestion-status"
          >
            {getSuggestionStatusLabel(suggestion.status)}
          </Badge>
          {canAcceptSuggestion(suggestion) && (
            <Tooltip label={t`Accept`}>
              <ActionIcon
                aria-label={t`Accept`}
                disabled={isDeciding}
                onClick={() =>
                  decide({
                    decision: "accept",
                    suggestion_ids: [suggestion.id],
                  })
                }
              >
                <Icon name="check" />
              </ActionIcon>
            </Tooltip>
          )}
          {canRejectSuggestion(suggestion) && (
            <Tooltip label={t`Reject`}>
              <ActionIcon
                aria-label={t`Reject`}
                disabled={isDeciding}
                onClick={() =>
                  decide({
                    decision: "reject",
                    suggestion_ids: [suggestion.id],
                  })
                }
              >
                <Icon name="close" />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </td>
    </tr>
  );
}

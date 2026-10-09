import cx from "classnames";
import { type KeyboardEvent, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useMetadataToasts } from "metabase/common/hooks";
import {
  DataSensitivityPicker,
  SemanticTypePicker,
} from "metabase/metadata/components";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  Group,
  Icon,
  Loader,
  Modal,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "metabase/ui";
import {
  useApplyMetadataGenerationRunMutation,
  useDecideMetadataGenerationSuggestionsMutation,
  useEditMetadataGenerationSuggestionMutation,
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
  MetadataGenerationSuggestionId,
} from "metabase-types/api";

import { getAttributeLabel } from "../../utils";

import S from "./ReviewModal.module.css";
import {
  DESCRIPTION_MAX_LENGTH,
  type RunTotals,
  formatSuggestionValue,
  getApplyFailureReasonLabel,
  getApplySummary,
  getFieldLabel,
  getHumanSetAcceptable,
  getNotAcceptedCount,
  getRunTotals,
  getSuggestionStatusColor,
  getSuggestionStatusLabel,
  getSuggestionValue,
  getTableCheckboxState,
  getTableLabel,
  hasOpenDecisions,
  isFieldDataSensitivity,
  isHumanSet,
  isSuggestionChecked,
  isSuggestionDecidable,
  isSuggestionEdited,
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

type DecideState = {
  decide: Decide;
  /** True while a decision request runs. */
  isDeciding: boolean;
  /** The suggestions whose own decision request runs. */
  decidingIds: ReadonlySet<MetadataGenerationSuggestionId>;
};

function useDecide(runId: MetadataGenerationRunId): DecideState {
  const [decideSuggestions] = useDecideMetadataGenerationSuggestionsMutation();
  const [requestCount, setRequestCount] = useState(0);
  const [decidingIds, setDecidingIds] = useState<
    ReadonlySet<MetadataGenerationSuggestionId>
  >(new Set());
  const { sendErrorToast } = useMetadataToasts();

  const updateDecidingIds = (
    ids: MetadataGenerationSuggestionId[] = [],
    isAdding: boolean,
  ) =>
    setDecidingIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => (isAdding ? next.add(id) : next.delete(id)));
      return next;
    });

  const decide: Decide = async (request) => {
    setRequestCount((count) => count + 1);
    updateDecidingIds(request.suggestion_ids, true);
    const { error } = await decideSuggestions({ run_id: runId, ...request });
    updateDecidingIds(request.suggestion_ids, false);
    setRequestCount((count) => count - 1);
    if (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to save the decision`));
    }
  };

  return { decide, isDeciding: requestCount > 0, decidingIds };
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
  const decideState = useDecide(runId);

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
        decideState={decideState}
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
            decideState={decideState}
          />
        </Box>
      </Flex>
    </Stack>
  );
}

type RunHeaderProps = {
  runId: MetadataGenerationRunId;
  totals: RunTotals;
  decideState: DecideState;
  onApply: (result: MetadataGenerationApplyResult) => void;
};

function RunHeader({
  runId,
  totals,
  decideState: { decide, isDeciding },
  onApply,
}: RunHeaderProps) {
  const [applyRun, { isLoading: isApplying }] =
    useApplyMetadataGenerationRunMutation();
  const { sendErrorToast } = useMetadataToasts();
  const { counts, humanSetPending } = totals;
  const notAccepted = getNotAcceptedCount(counts);

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
          <StatusCount label={t`Not accepted`} count={notAccepted} />
          <StatusCount label={t`Accepted`} count={counts.accepted} />
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
          label={t`Accepts every suggestion, except those that would replace a value a person set.`}
        >
          <Button
            variant="default"
            disabled={notAccepted === 0 || isDeciding}
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
  const { accepted, stale, applied } = table.counts;
  const notAccepted = getNotAcceptedCount(table.counts);
  const parts = [
    notAccepted > 0 && t`${notAccepted} not accepted`,
    accepted > 0 && t`${accepted} accepted`,
    stale > 0 && t`${stale} stale`,
    applied > 0 && t`${applied} applied`,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

type TableReviewProps = {
  runId: MetadataGenerationRunId;
  table: MetadataGenerationRunTable;
  decideState: DecideState;
};

function TableReview({ runId, table, decideState }: TableReviewProps) {
  const { decide, isDeciding } = decideState;
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

  const humanSetAcceptable = getHumanSetAcceptable(suggestions);
  const tableCheckbox = getTableCheckboxState(suggestions);

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
        </Group>
      </Group>
      <ScrollArea flex={1}>
        <table
          className={S.suggestions}
          data-testid="metadata-generation-suggestions"
        >
          <colgroup>
            <col className={S.checkboxColumn} />
            <col className={S.fieldColumn} />
            <col className={S.attributeColumn} />
            <col className={S.currentColumn} />
            <col />
            <col className={S.reasoningColumn} />
          </colgroup>
          <thead>
            <tr>
              <th>
                <Tooltip
                  label={t`Accepts or clears every suggestion of this table, except those that would replace a value a person set.`}
                >
                  <Box component="span" display="inline-flex">
                    <Checkbox
                      aria-label={t`Accept the suggestions of this table`}
                      checked={tableCheckbox.checked}
                      indeterminate={tableCheckbox.indeterminate}
                      disabled={tableCheckbox.disabled || isDeciding}
                      onChange={() =>
                        decide({
                          decision: tableCheckbox.checked
                            ? "unaccept"
                            : "accept",
                          table_ids: [table.table_id],
                        })
                      }
                    />
                  </Box>
                </Tooltip>
              </th>
              <th>{t`Field`}</th>
              <th>{t`Attribute`}</th>
              <th>{t`Current`}</th>
              <th>{t`Proposed`}</th>
              <th aria-label={t`Reasoning`} />
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
                runId={runId}
                isDeciding={decideState.decidingIds.has(suggestion.id)}
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
  runId: MetadataGenerationRunId;
  suggestion: MetadataGenerationSuggestion;
  isFirstOfField: boolean;
  isDeciding: boolean;
  decide: Decide;
};

function SuggestionRow({
  runId,
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
  const fieldLabel = getFieldLabel(suggestion);
  const attributeLabel = getAttributeLabel(suggestion.attribute);
  const isChecked = isSuggestionChecked(suggestion);

  return (
    <tr
      className={cx({ [S.humanSet]: isConflict })}
      data-testid="metadata-generation-suggestion"
    >
      <td>
        <Checkbox
          aria-label={t`Accept ${attributeLabel} of ${fieldLabel}`}
          checked={isChecked}
          disabled={!isSuggestionDecidable(suggestion) || isDeciding}
          onChange={() =>
            decide({
              decision: isChecked ? "unaccept" : "accept",
              suggestion_ids: [suggestion.id],
            })
          }
        />
      </td>
      <td>
        {isFirstOfField && (
          <Text fw="bold" title={fieldLabel} truncate>
            {fieldLabel}
          </Text>
        )}
      </td>
      <td>
        <Text title={attributeLabel} truncate>
          {attributeLabel}
        </Text>
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
        <Stack gap={4} align="flex-start">
          <ProposedValue runId={runId} suggestion={suggestion} />
          {!isSuggestionDecidable(suggestion) && (
            <Tooltip label={getFixedStatusTooltip(suggestion)}>
              <Badge
                variant="light"
                color={getSuggestionStatusColor(suggestion.status)}
                data-testid="metadata-generation-suggestion-status"
              >
                {getSuggestionStatusLabel(suggestion.status)}
              </Badge>
            </Tooltip>
          )}
        </Stack>
      </td>
      <td>
        {suggestion.reasoning && (
          <Tooltip label={suggestion.reasoning} maw="25rem" multiline>
            <Icon
              name="info"
              c="text-secondary"
              aria-label={t`Reasoning`}
              aria-hidden={false}
            />
          </Tooltip>
        )}
      </td>
    </tr>
  );
}

type ProposedValueProps = {
  runId: MetadataGenerationRunId;
  suggestion: MetadataGenerationSuggestion;
};

function ProposedValue({ runId, suggestion }: ProposedValueProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editSuggestion] = useEditMetadataGenerationSuggestionMutation();
  const { sendErrorToast } = useMetadataToasts();
  const { attribute, proposed_value } = suggestion;
  const value = getSuggestionValue(suggestion);
  const isEdited = isSuggestionEdited(suggestion);
  const canEdit = isSuggestionDecidable(suggestion);
  const attributeLabel = getAttributeLabel(attribute);
  const fieldLabel = getFieldLabel(suggestion);

  const save = async (newValue: string | null) => {
    setIsEditing(false);
    const editedValue = newValue === proposed_value ? null : newValue;
    if (editedValue === suggestion.edited_value) {
      return;
    }
    const { error } = await editSuggestion({
      run_id: runId,
      suggestion_id: suggestion.id,
      value: editedValue,
    });
    if (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to save the value`));
    }
  };

  if (isEditing) {
    return (
      <ValueEditor
        suggestion={suggestion}
        value={value}
        onSave={save}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <Stack
      gap={4}
      align="flex-start"
      data-testid="metadata-generation-proposed"
    >
      <Group gap={4} wrap="nowrap" align="flex-start">
        <Text>{formatSuggestionValue(attribute, value)}</Text>
        {canEdit && (
          <ActionIcon
            size="sm"
            aria-label={t`Edit ${attributeLabel} of ${fieldLabel}`}
            onClick={() => setIsEditing(true)}
          >
            <Icon name="pencil" size={12} />
          </ActionIcon>
        )}
      </Group>
      {isEdited && (
        <Group gap={4} wrap="nowrap">
          <Tooltip
            label={t`AI proposal: ${formatSuggestionValue(attribute, proposed_value)}`}
            maw="25rem"
            multiline
          >
            <Badge variant="light" color="brand">{t`Edited`}</Badge>
          </Tooltip>
          {canEdit && (
            <Button
              size="compact-sm"
              variant="subtle"
              leftSection={<Icon name="undo" size={12} />}
              onClick={() => save(null)}
            >
              {t`Use AI proposal`}
            </Button>
          )}
        </Group>
      )}
    </Stack>
  );
}

type ValueEditorProps = {
  suggestion: MetadataGenerationSuggestion;
  value: string;
  onSave: (value: string) => void;
  onCancel: () => void;
};

function ValueEditor({
  suggestion,
  value,
  onSave,
  onCancel,
}: ValueEditorProps) {
  const attributeLabel = getAttributeLabel(suggestion.attribute);

  switch (suggestion.attribute) {
    case "description":
      return (
        <DescriptionEditor
          value={value}
          label={attributeLabel}
          onSave={onSave}
          onCancel={onCancel}
        />
      );
    case "semantic_type":
      return (
        <SemanticTypePicker
          aria-label={attributeLabel}
          field={{
            base_type: suggestion.field_base_type,
            effective_type: suggestion.field_effective_type ?? undefined,
          }}
          value={value}
          canSetKeyOrEmpty={false}
          defaultDropdownOpened
          w="100%"
          onChange={(newValue) => (newValue ? onSave(newValue) : onCancel())}
          onDropdownClose={onCancel}
        />
      );
    case "data_sensitivity":
      return (
        <DataSensitivityPicker
          aria-label={attributeLabel}
          value={isFieldDataSensitivity(value) ? value : null}
          source={null}
          canClear={false}
          defaultDropdownOpened
          w="100%"
          onChange={(newValue) => (newValue ? onSave(newValue) : onCancel())}
          onDropdownClose={onCancel}
          onReset={onCancel}
        />
      );
  }
}

type DescriptionEditorProps = {
  value: string;
  label: string;
  onSave: (value: string) => void;
  onCancel: () => void;
};

function DescriptionEditor({
  value,
  label,
  onSave,
  onCancel,
}: DescriptionEditorProps) {
  const [text, setText] = useState(value);
  const trimmed = text.trim();
  const canSave = trimmed.length > 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      // Escape closes the editor, not the modal.
      event.stopPropagation();
      onCancel();
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSave) {
        onSave(trimmed);
      }
    }
  };

  return (
    <Stack gap={4} w="100%">
      <Textarea
        aria-label={label}
        value={text}
        maxLength={DESCRIPTION_MAX_LENGTH}
        autosize
        minRows={2}
        autoFocus
        onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      <Group gap="xs" justify="flex-end">
        <Button size="compact-sm" variant="subtle" onClick={onCancel}>
          {t`Cancel`}
        </Button>
        <Button
          size="compact-sm"
          variant="filled"
          disabled={!canSave}
          onClick={() => onSave(trimmed)}
        >
          {t`Save`}
        </Button>
      </Group>
    </Stack>
  );
}

function getFixedStatusTooltip(
  suggestion: MetadataGenerationSuggestion,
): string {
  return suggestion.status === "applied"
    ? t`This suggestion was applied.`
    : t`The field changed after the run, so this suggestion can no longer be applied.`;
}

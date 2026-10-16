import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { type KeyboardEvent, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
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
  useGetMetadataGenerationRunQuery,
  useListMetadataGenerationRunTablesQuery,
  useListMetadataGenerationSuggestionsQuery,
  useStartMetadataGenerationRunMutation,
} from "metabase-enterprise/api";
import type {
  ConcreteTableId,
  FieldId,
  MetadataGenerationApplyResult,
  MetadataGenerationDecisionRequest,
  MetadataGenerationRun,
  MetadataGenerationRunId,
  MetadataGenerationRunTable,
  MetadataGenerationSuggestion,
  MetadataGenerationSuggestionId,
} from "metabase-types/api";

import { getAttributeLabel, getRunRequest } from "../../utils";

import { FieldDetailsPane } from "./FieldDetailsPane";
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
  /** Called with the new run after the person regenerates the suggestions. */
  onRegenerate?: (run: MetadataGenerationRun) => void;
  /** Called when the person is done with a run that has no suggestions. */
  onDone?: () => void;
};

export function ReviewModal({
  runId,
  opened,
  onClose,
  onRegenerate,
  onDone,
}: ReviewModalProps) {
  const { data: tables } = useListMetadataGenerationRunTablesQuery(runId, {
    skip: !opened,
  });
  const isEmpty = tables != null && tables.length === 0;

  return (
    <Modal
      opened={opened}
      title={t`Review AI-generated metadata suggestions`}
      size={isEmpty ? "lg" : "90rem"}
      onClose={onClose}
    >
      {opened && isEmpty && (
        <EmptyRun
          runId={runId}
          onRegenerate={onRegenerate}
          onDone={onDone ?? onClose}
        />
      )}
      {opened && !isEmpty && (
        <ReviewContent runId={runId} onRegenerate={onRegenerate} />
      )}
    </Modal>
  );
}

type EmptyRunProps = {
  runId: MetadataGenerationRunId;
  onRegenerate?: (run: MetadataGenerationRun) => void;
  onDone: () => void;
};

function EmptyRun({ runId, onRegenerate, onDone }: EmptyRunProps) {
  const { regenerate, canRegenerate, isRegenerating } = useRegenerate(
    runId,
    onRegenerate,
  );

  return (
    <Stack gap="lg" data-testid="metadata-generation-review-empty">
      <Text>{t`This run has no suggestions.`}</Text>
      <Group justify="flex-end" gap="sm">
        {onRegenerate != null && (
          <Button
            disabled={!canRegenerate}
            loading={isRegenerating}
            onClick={regenerate}
          >
            {t`Regenerate suggestions`}
          </Button>
        )}
        <Button onClick={onDone}>{t`Done`}</Button>
      </Group>
    </Stack>
  );
}

type RegenerateState = {
  /** Starts a run with the same scope and attributes as this one. */
  regenerate: () => Promise<void>;
  canRegenerate: boolean;
  isRegenerating: boolean;
};

function useRegenerate(
  runId: MetadataGenerationRunId,
  onRegenerate?: (run: MetadataGenerationRun) => void,
): RegenerateState {
  const [startRun, { isLoading: isRegenerating }] =
    useStartMetadataGenerationRunMutation();
  const { data: run } = useGetMetadataGenerationRunQuery(runId);
  const { sendErrorToast } = useMetadataToasts();

  const regenerate = async () => {
    if (run == null) {
      return;
    }
    const { data, error } = await startRun(getRunRequest(run));
    if (error) {
      sendErrorToast(
        getErrorMessage(error, t`Failed to regenerate the suggestions`),
      );
    } else if (data) {
      onRegenerate?.(data);
    }
  };

  return { regenerate, canRegenerate: run != null, isRegenerating };
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

type ReviewContentProps = {
  runId: MetadataGenerationRunId;
  onRegenerate?: (run: MetadataGenerationRun) => void;
};

function ReviewContent({ runId, onRegenerate }: ReviewContentProps) {
  const {
    data: tables,
    error,
    isLoading,
  } = useListMetadataGenerationRunTablesQuery(runId);
  const [selectedTableId, setSelectedTableId] =
    useState<ConcreteTableId | null>(null);
  const [applyResult, setApplyResult] =
    useState<MetadataGenerationApplyResult | null>(null);
  const [detailFieldId, setDetailFieldId] = useState<FieldId | null>(null);
  const decideState = useDecide(runId);

  if (error) {
    return <Text c="feedback-negative">{getErrorMessage(error)}</Text>;
  }
  if (isLoading || tables == null) {
    return <Loader size="sm" />;
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
        onApply={setApplyResult}
        onRegenerate={onRegenerate}
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
            onSelect={(tableId) => {
              setSelectedTableId(tableId);
              setDetailFieldId(null);
            }}
          />
        </ScrollArea>
        <Box flex={1} miw={0}>
          <TableReview
            key={selectedTable.table_id}
            runId={runId}
            table={selectedTable}
            decideState={decideState}
            detailFieldId={detailFieldId}
            onToggleFieldDetails={(fieldId) =>
              setDetailFieldId((current) =>
                current === fieldId ? null : fieldId,
              )
            }
          />
        </Box>
        {detailFieldId != null && (
          <FieldDetailsPane
            key={detailFieldId}
            tableId={selectedTable.table_id}
            fieldId={detailFieldId}
            onClose={() => setDetailFieldId(null)}
          />
        )}
      </Flex>
    </Stack>
  );
}

type RunHeaderProps = {
  runId: MetadataGenerationRunId;
  totals: RunTotals;
  onApply: (result: MetadataGenerationApplyResult) => void;
  onRegenerate?: (run: MetadataGenerationRun) => void;
};

function RunHeader({ runId, totals, onApply, onRegenerate }: RunHeaderProps) {
  const [applyRun, { isLoading: isApplying }] =
    useApplyMetadataGenerationRunMutation();
  const { regenerate, canRegenerate, isRegenerating } = useRegenerate(
    runId,
    onRegenerate,
  );
  const [
    isRegenerateConfirmOpen,
    { open: openRegenerateConfirm, close: closeRegenerateConfirm },
  ] = useDisclosure();
  const { sendErrorToast } = useMetadataToasts();
  const { counts, humanSetPending } = totals;

  const handleRegenerate = async () => {
    await regenerate();
    closeRegenerateConfirm();
  };

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
      <Box>
        {humanSetPending > 0 && (
          <Text size="sm" c="text-secondary">
            {ngettext(
              msgid`${humanSetPending} suggestion would replace a value a person set. Accept it one by one.`,
              `${humanSetPending} suggestions would replace values a person set. Accept them one by one.`,
              humanSetPending,
            )}
          </Text>
        )}
      </Box>
      <Group gap="sm" wrap="nowrap">
        {onRegenerate != null && (
          <Tooltip label={t`Regenerate suggestions`}>
            <ActionIcon
              aria-label={t`Regenerate suggestions`}
              disabled={!canRegenerate}
              onClick={openRegenerateConfirm}
            >
              <Icon name="refresh" />
            </ActionIcon>
          </Tooltip>
        )}
        <ConfirmModal
          opened={isRegenerateConfirmOpen}
          title={t`Regenerate suggestions?`}
          message={t`This discards the current suggestions, including the ones you accepted or edited, and starts a new run.`}
          confirmButtonText={t`Regenerate`}
          confirmButtonProps={{ loading: isRegenerating }}
          onConfirm={handleRegenerate}
          onClose={closeRegenerateConfirm}
        />
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
            c={result.failed > 0 ? "feedback-warning" : "feedback-positive"}
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
                <Icon name="person" c="feedback-warning" aria-hidden={false} />
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
  /** The field whose details pane is open. */
  detailFieldId: FieldId | null;
  onToggleFieldDetails: (fieldId: FieldId) => void;
};

function TableReview({
  runId,
  table,
  decideState,
  detailFieldId,
  onToggleFieldDetails,
}: TableReviewProps) {
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
    return <Text c="feedback-negative">{getErrorMessage(error)}</Text>;
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
                c="feedback-warning"
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
            <col className={S.explanationColumn} />
            <col className={S.detailsColumn} />
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
              <th>{t`Explanation`}</th>
              <th aria-label={t`Field details`} />
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
                isDetailOpen={suggestion.field_id === detailFieldId}
                onToggleFieldDetails={onToggleFieldDetails}
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
  isDetailOpen: boolean;
  onToggleFieldDetails: (fieldId: FieldId) => void;
};

function SuggestionRow({
  runId,
  suggestion,
  isFirstOfField,
  isDeciding,
  decide,
  isDetailOpen,
  onToggleFieldDetails,
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
            <Text c="text-secondary">{t`Empty`}</Text>
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
          <ProposedValue
            runId={runId}
            suggestion={suggestion}
            decide={decide}
          />
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
              name="comment"
              c="text-secondary"
              aria-label={t`Explanation`}
              aria-hidden={false}
            />
          </Tooltip>
        )}
      </td>
      <td>
        <Tooltip
          label={isDetailOpen ? t`Hide field details` : t`Field details`}
        >
          <ActionIcon
            aria-label={t`Field details of ${fieldLabel}`}
            aria-pressed={isDetailOpen}
            selected={isDetailOpen}
            onClick={() => onToggleFieldDetails(suggestion.field_id)}
          >
            <Icon name="info" />
          </ActionIcon>
        </Tooltip>
      </td>
    </tr>
  );
}

type ProposedValueProps = {
  runId: MetadataGenerationRunId;
  suggestion: MetadataGenerationSuggestion;
  decide: Decide;
};

function ProposedValue({ runId, suggestion, decide }: ProposedValueProps) {
  const [editSuggestion] = useEditMetadataGenerationSuggestionMutation();
  const { sendErrorToast } = useMetadataToasts();
  const { attribute, proposed_value } = suggestion;
  const value = getSuggestionValue(suggestion);
  const isEdited = isSuggestionEdited(suggestion);
  const canEdit = isSuggestionDecidable(suggestion);
  const attributeLabel = getAttributeLabel(attribute);
  const fieldLabel = getFieldLabel(suggestion);

  const save = async (newValue: string | null) => {
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
      return;
    }
    // Saving a value accepts the suggestion on the backend. Going back to the
    // AI proposal does not, so the row is checked here.
    if (editedValue == null && !isSuggestionChecked(suggestion)) {
      await decide({ decision: "accept", suggestion_ids: [suggestion.id] });
    }
  };

  if (!canEdit) {
    return (
      <Stack
        gap={4}
        align="flex-start"
        data-testid="metadata-generation-proposed"
      >
        <Text>{formatSuggestionValue(attribute, value)}</Text>
        {isEdited && <EditedBadge suggestion={suggestion} />}
      </Stack>
    );
  }

  return (
    <Stack gap={4} align="stretch" data-testid="metadata-generation-proposed">
      <ValueInput
        suggestion={suggestion}
        value={value}
        label={t`Proposed ${attributeLabel} of ${fieldLabel}`}
        onChange={save}
      />
      {isEdited && (
        <Group gap={4} wrap="nowrap">
          <EditedBadge suggestion={suggestion} />
          <Button
            size="compact-sm"
            variant="subtle"
            leftSection={<Icon name="undo" size={12} />}
            onClick={() => save(null)}
          >
            {t`Use AI proposal`}
          </Button>
        </Group>
      )}
    </Stack>
  );
}

function EditedBadge({
  suggestion,
}: {
  suggestion: MetadataGenerationSuggestion;
}) {
  const proposal = formatSuggestionValue(
    suggestion.attribute,
    suggestion.proposed_value,
  );
  return (
    <Tooltip label={t`AI proposal: ${proposal}`} maw="25rem" multiline>
      <Badge variant="light" color="brand">{t`Edited`}</Badge>
    </Tooltip>
  );
}

type ValueInputProps = {
  suggestion: MetadataGenerationSuggestion;
  value: string;
  label: string;
  onChange: (value: string) => void;
};

function ValueInput({ suggestion, value, label, onChange }: ValueInputProps) {
  switch (suggestion.attribute) {
    case "description":
      return (
        <DescriptionInput
          // Reset the draft when the saved value changes, e.g. after "Use AI proposal".
          key={value}
          value={value}
          label={label}
          onChange={onChange}
        />
      );
    case "semantic_type":
      return (
        <SemanticTypePicker
          aria-label={label}
          field={{
            base_type: suggestion.field_base_type,
            effective_type: suggestion.field_effective_type ?? undefined,
          }}
          value={value}
          canSetKeyOrEmpty={false}
          w="100%"
          onChange={(newValue) => newValue != null && onChange(newValue)}
        />
      );
    case "data_sensitivity":
      return (
        <DataSensitivityPicker
          aria-label={label}
          value={isFieldDataSensitivity(value) ? value : null}
          source={null}
          canClear={false}
          w="100%"
          onChange={(newValue) => newValue != null && onChange(newValue)}
          onReset={() => undefined}
        />
      );
  }
}

type DescriptionInputProps = {
  value: string;
  label: string;
  onChange: (value: string) => void;
};

function DescriptionInput({ value, label, onChange }: DescriptionInputProps) {
  const [text, setText] = useState(value);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed.length > 0 && trimmed !== value) {
      onChange(trimmed);
    } else {
      setText(value);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      // Escape drops the draft, not the modal.
      event.stopPropagation();
      setText(value);
      event.currentTarget.blur();
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <Textarea
      aria-label={label}
      value={text}
      maxLength={DESCRIPTION_MAX_LENGTH}
      autosize
      minRows={1}
      onChange={(event) => setText(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  );
}

function getFixedStatusTooltip(
  suggestion: MetadataGenerationSuggestion,
): string {
  return suggestion.status === "applied"
    ? t`This suggestion was applied.`
    : t`The field changed after the run, so this suggestion can no longer be applied.`;
}

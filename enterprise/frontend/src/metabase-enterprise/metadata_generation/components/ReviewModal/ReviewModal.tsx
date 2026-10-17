import { useDisclosure } from "@mantine/hooks";
import { type KeyboardEvent, useMemo, useState } from "react";
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
  Button,
  Card,
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
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
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
  const [applyResult, setApplyResult] =
    useState<MetadataGenerationApplyResult | null>(null);
  const isEmpty = tables != null && tables.length === 0;
  const hasTables = tables != null && tables.length > 0;

  const handleClose = () => {
    setApplyResult(null);
    onClose();
  };

  return (
    <Modal.Root
      opened={opened}
      size={isEmpty ? "lg" : "90rem"}
      onClose={handleClose}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header className={S.header}>
          <Modal.Title>{t`Review AI-generated metadata suggestions`}</Modal.Title>
          <Group gap="sm" wrap="nowrap">
            {opened && hasTables && (
              <ReviewActions
                runId={runId}
                totals={getRunTotals(tables)}
                onApply={setApplyResult}
                onRegenerate={onRegenerate}
              />
            )}
            <ActionIcon aria-label={t`Close`} onClick={handleClose}>
              <Icon name="close" />
            </ActionIcon>
          </Group>
        </Modal.Header>
        <Modal.Body className={S.body} p="xl">
          {opened && tables == null && <Loader size="sm" />}
          {opened && isEmpty && (
            <EmptyRun
              runId={runId}
              onRegenerate={onRegenerate}
              onDone={onDone ?? handleClose}
            />
          )}
          {opened && hasTables && (
            <ReviewContent
              runId={runId}
              tables={tables}
              applyResult={applyResult}
              onDismissApplyResult={() => setApplyResult(null)}
            />
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
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
  tables: MetadataGenerationRunTable[];
  applyResult: MetadataGenerationApplyResult | null;
  onDismissApplyResult: () => void;
};

function ReviewContent({
  runId,
  tables,
  applyResult,
  onDismissApplyResult,
}: ReviewContentProps) {
  const [selectedTableId, setSelectedTableId] =
    useState<ConcreteTableId | null>(null);
  const [detailFieldId, setDetailFieldId] = useState<FieldId | null>(null);
  const decideState = useDecide(runId);
  const { humanSetPending } = getRunTotals(tables);

  const selectedTable =
    tables.find((table) => table.table_id === selectedTableId) ??
    tables.find(hasOpenDecisions) ??
    tables[0];

  return (
    <Stack gap="md" data-testid="metadata-generation-review">
      {humanSetPending > 0 && (
        <Text size="sm" c="text-secondary">
          {ngettext(
            msgid`${humanSetPending} suggestion would replace a value a person set. Accept it one by one.`,
            `${humanSetPending} suggestions would replace values a person set. Accept them one by one.`,
            humanSetPending,
          )}
        </Text>
      )}
      {applyResult && (
        <ApplyResult result={applyResult} onDismiss={onDismissApplyResult} />
      )}
      <Flex gap="lg" h="65vh" mih={0}>
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
        <Card withBorder p={0} flex={1} miw={0} mih={0} display="flex">
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
        </Card>
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

type ReviewActionsProps = {
  runId: MetadataGenerationRunId;
  totals: RunTotals;
  onApply: (result: MetadataGenerationApplyResult) => void;
  onRegenerate?: (run: MetadataGenerationRun) => void;
};

/** The regenerate and apply actions of the modal header. */
function ReviewActions({
  runId,
  totals,
  onApply,
  onRegenerate,
}: ReviewActionsProps) {
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
  const { counts } = totals;

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
    <>
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
    </>
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
      bg="background_surface-primary"
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

type SuggestionNode = {
  id: MetadataGenerationSuggestionId;
  suggestion: MetadataGenerationSuggestion;
  /** The first suggestion of a field shows the field name. */
  isFirstOfField: boolean;
};

const noop = () => undefined;

function TableReview({
  runId,
  table,
  decideState,
  detailFieldId,
  onToggleFieldDetails,
}: TableReviewProps) {
  const { decide, decidingIds } = decideState;
  const {
    data: suggestions,
    error,
    isLoading,
  } = useListMetadataGenerationSuggestionsQuery({
    run_id: runId,
    table_id: table.table_id,
  });

  const nodes = useMemo<SuggestionNode[]>(
    () =>
      (suggestions ?? []).map((suggestion, index, all) => ({
        id: suggestion.id,
        suggestion,
        isFirstOfField:
          index === 0 || all[index - 1].field_id !== suggestion.field_id,
      })),
    [suggestions],
  );
  const rowSelection = useMemo(
    () =>
      Object.fromEntries(
        nodes
          .filter((node) => isSuggestionChecked(node.suggestion))
          .map((node) => [String(node.id), true]),
      ),
    [nodes],
  );
  const columns = useMemo(
    () => getColumns({ runId, decide, detailFieldId, onToggleFieldDetails }),
    [runId, decide, detailFieldId, onToggleFieldDetails],
  );
  const instance = useTreeTableInstance<SuggestionNode>({
    data: nodes,
    columns,
    getNodeId: (node) => String(node.id),
    enableRowSelection: (row) => isSuggestionDecidable(row.original.suggestion),
    rowSelection,
    onRowSelectionChange: noop,
  });

  if (error) {
    return (
      <Text c="feedback-negative" p="md">
        {getErrorMessage(error)}
      </Text>
    );
  }
  if (isLoading || suggestions == null) {
    return <Loader size="sm" m="md" />;
  }

  const tableCheckbox = getTableCheckboxState(suggestions);

  return (
    <TreeTable
      instance={instance}
      hierarchical={false}
      showCheckboxes
      classNames={{ root: S.suggestions, cell: S.suggestionCell }}
      ariaLabel={t`Suggestions of ${getTableLabel(table)}`}
      headerCheckboxAriaLabel={t`Accept the suggestions of this table`}
      onHeaderCheckboxClick={() =>
        decide({
          decision: tableCheckbox.checked ? "unaccept" : "accept",
          table_ids: [table.table_id],
        })
      }
      onCheckboxClick={(row) =>
        decide({
          decision: isSuggestionChecked(row.original.suggestion)
            ? "unaccept"
            : "accept",
          suggestion_ids: [row.original.id],
        })
      }
      isRowLoading={(row) => decidingIds.has(row.original.id)}
      getRowProps={(row) => ({
        "data-testid": "metadata-generation-suggestion",
        "data-human-set":
          isHumanSet(row.original.suggestion) &&
          isSuggestionDecidable(row.original.suggestion),
      })}
      emptyState={
        <Text
          c="text-secondary"
          p="md"
        >{t`No suggestions for this table.`}</Text>
      }
    />
  );
}

type ColumnOptions = {
  runId: MetadataGenerationRunId;
  decide: Decide;
  detailFieldId: FieldId | null;
  onToggleFieldDetails: (fieldId: FieldId) => void;
};

function getColumns({
  runId,
  decide,
  detailFieldId,
  onToggleFieldDetails,
}: ColumnOptions): TreeTableColumnDef<SuggestionNode>[] {
  return [
    {
      id: "field",
      header: t`Field`,
      width: 180,
      cell: ({ row }) => {
        const { suggestion, isFirstOfField } = row.original;
        const fieldLabel = getFieldLabel(suggestion);
        return isFirstOfField ? (
          <Text fw="bold" title={fieldLabel} truncate>
            {fieldLabel}
          </Text>
        ) : null;
      },
    },
    {
      id: "attribute",
      header: t`Attribute`,
      width: 150,
      cell: ({ row }) => {
        const attributeLabel = getAttributeLabel(
          row.original.suggestion.attribute,
        );
        return (
          <Text title={attributeLabel} truncate>
            {attributeLabel}
          </Text>
        );
      },
    },
    {
      id: "current",
      header: t`Current`,
      minWidth: 180,
      maxWidth: 360,
      cell: ({ row }) => <CurrentValue suggestion={row.original.suggestion} />,
    },
    {
      id: "proposed",
      header: t`Proposed`,
      minWidth: 280,
      cell: ({ row }) => (
        <Stack gap={4} align="flex-start" py="xs">
          <ProposedValue
            runId={runId}
            suggestion={row.original.suggestion}
            decide={decide}
          />
          {!isSuggestionDecidable(row.original.suggestion) && (
            <Tooltip label={getFixedStatusTooltip(row.original.suggestion)}>
              <Badge
                variant="light"
                color={getSuggestionStatusColor(row.original.suggestion.status)}
                data-testid="metadata-generation-suggestion-status"
              >
                {getSuggestionStatusLabel(row.original.suggestion.status)}
              </Badge>
            </Tooltip>
          )}
        </Stack>
      ),
    },
    {
      id: "explanation",
      header: t`Explanation`,
      width: 120,
      cell: ({ row }) => {
        const { reasoning } = row.original.suggestion;
        return reasoning ? (
          <Tooltip label={reasoning} maw="25rem" multiline>
            <Icon
              name="comment"
              c="text-secondary"
              aria-label={t`Explanation`}
              aria-hidden={false}
            />
          </Tooltip>
        ) : null;
      },
    },
    {
      id: "details",
      header: "",
      width: 64,
      cell: ({ row }) => {
        const { suggestion } = row.original;
        const isDetailOpen = suggestion.field_id === detailFieldId;
        return (
          <Tooltip
            label={isDetailOpen ? t`Hide field details` : t`Field details`}
          >
            <ActionIcon
              aria-label={t`Field details of ${getFieldLabel(suggestion)}`}
              aria-pressed={isDetailOpen}
              selected={isDetailOpen}
              onClick={() => onToggleFieldDetails(suggestion.field_id)}
            >
              <Icon name="info" />
            </ActionIcon>
          </Tooltip>
        );
      },
    },
  ];
}

function CurrentValue({
  suggestion,
}: {
  suggestion: MetadataGenerationSuggestion;
}) {
  const current = formatSuggestionValue(
    suggestion.attribute,
    suggestion.current_value,
  );
  return (
    <Stack gap={4} align="flex-start" py="xs">
      {current != null ? (
        <Text>{current}</Text>
      ) : (
        <Text c="text-secondary">{t`Empty`}</Text>
      )}
      {isHumanSet(suggestion) && (
        <Badge variant="light" color="warning">{t`Set by a person`}</Badge>
      )}
      {suggestion.source === "ai" && (
        <Badge variant="light" color="neutral">{t`Set by AI`}</Badge>
      )}
    </Stack>
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

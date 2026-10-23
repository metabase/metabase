import { useDisclosure } from "@mantine/hooks";
import type { Row } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import cx from "classnames";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { msgid, ngettext, t } from "ttag";

import { skipToken, useGetDatabaseMetadataQuery } from "metabase/api";
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
  Card,
  Center,
  Checkbox,
  Flex,
  Group,
  Icon,
  Loader,
  Modal,
  NavLink,
  ScrollArea,
  SortableHeaderPill,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
  TreeTable,
  type TreeTableColumnDef,
  type TreeTableInstance,
  useTreeTableInstance,
} from "metabase/ui";
import {
  useApplyMetadataGenerationProposalsMutation,
  useGetMetadataGenerationRunQuery,
  useListMetadataGenerationProposalTablesQuery,
  useListMetadataGenerationProposalsQuery,
  useStartMetadataGenerationRunMutation,
} from "metabase-enterprise/api";
import type {
  ConcreteTableId,
  DatabaseId,
  FieldId,
  MetadataGenerationApplyFailure,
  MetadataGenerationApplyResult,
  MetadataGenerationProposal,
  MetadataGenerationProposalTable,
  MetadataGenerationRun,
  MetadataGenerationRunId,
} from "metabase-types/api";

import { getAttributeLabel, getRunRequest } from "../../utils";

import { FieldDetailsPane } from "./FieldDetailsPane";
import S from "./ReviewModal.module.css";
import {
  DESCRIPTION_MAX_LENGTH,
  type ProposalEdits,
  type ProposalSelection,
  type TableCheckboxState,
  formatProposalValue,
  getApplyFailureReasonLabel,
  getApplyRequestBody,
  getApplySummary,
  getBulkDecidable,
  getFieldLabel,
  getHumanSetPendingCount,
  getProposalValue,
  getTableCheckboxState,
  getTableLabel,
  isFieldDataSensitivity,
  isHumanSet,
  isProposalEdited,
  setEdit,
  setSelected,
} from "./utils";

type ReviewModalProps = {
  /** The review lists the pending proposals of every table of this database, whatever run made them. */
  databaseId: DatabaseId;
  /** The run that "Regenerate suggestions" repeats when there is nothing to review. */
  latestRunId?: MetadataGenerationRunId | null;
  opened: boolean;
  onClose: () => void;
  /** Called with the new run after the person regenerates the proposals. */
  onRegenerate?: (run: MetadataGenerationRun) => void;
  /** Called when the person is done and there are no proposals. */
  onDone?: () => void;
  /** Called after every proposal of the database is discarded. */
  onDiscard?: () => void;
};

export function ReviewModal({
  databaseId,
  latestRunId,
  opened,
  onClose,
  onRegenerate,
  onDone,
  onDiscard,
}: ReviewModalProps) {
  const { data: tables } = useListMetadataGenerationProposalTablesQuery(
    { database_id: databaseId },
    { skip: !opened, refetchOnMountOrArgChange: true },
  );
  const [applyResult, setApplyResult] =
    useState<MetadataGenerationApplyResult | null>(null);
  const draft = useReviewDraft(databaseId);
  const isEmpty = tables != null && tables.length === 0;
  const hasTables = tables != null && tables.length > 0;

  const handleClose = () => {
    setApplyResult(null);
    onClose();
  };

  const handleDiscard = () => {
    draft.reset();
    onDiscard?.();
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
                databaseId={databaseId}
                draft={draft}
                onApply={setApplyResult}
                onDiscard={onDiscard && handleDiscard}
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
              runId={latestRunId ?? null}
              onRegenerate={onRegenerate}
              onDone={onDone ?? handleClose}
            />
          )}
          {opened && hasTables && (
            <ReviewContent
              databaseId={databaseId}
              tables={tables}
              draft={draft}
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
  runId: MetadataGenerationRunId | null;
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
      <Text>{t`There are no suggestions to review.`}</Text>
      <Group justify="flex-end" gap="sm">
        {onRegenerate != null && runId != null && (
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
  runId: MetadataGenerationRunId | null,
  onRegenerate?: (run: MetadataGenerationRun) => void,
): RegenerateState {
  const [startRun, { isLoading: isRegenerating }] =
    useStartMetadataGenerationRunMutation();
  const { data: run } = useGetMetadataGenerationRunQuery(runId ?? skipToken);
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

type ReviewDraft = {
  selection: ProposalSelection;
  edits: ProposalEdits;
};

const EMPTY_DRAFT: ReviewDraft = {
  selection: new Map(),
  edits: new Map(),
};

type ReviewDraftState = ReviewDraft & {
  /** Ticks or unticks `suggestions`. */
  select: (
    proposals: MetadataGenerationProposal[],
    isSelected: boolean,
  ) => void;
  /** Sets the edited value of a proposal, or clears it with `null`, and ticks the proposal. */
  edit: (proposal: MetadataGenerationProposal, value: string | null) => void;
  reset: () => void;
};

/**
 * The review of a database before apply: the ticked proposals and the edited values. It lives only in this
 * component, so no request is sent until apply, and a reload or another database starts from nothing.
 */
function useReviewDraft(databaseId: DatabaseId): ReviewDraftState {
  const [state, setState] = useState({ databaseId, ...EMPTY_DRAFT });
  const draft = state.databaseId === databaseId ? state : EMPTY_DRAFT;

  const update = useCallback(
    (change: (draft: ReviewDraft) => ReviewDraft) =>
      setState((current) => ({
        databaseId,
        ...change(current.databaseId === databaseId ? current : EMPTY_DRAFT),
      })),
    [databaseId],
  );

  const select = useCallback(
    (proposals: MetadataGenerationProposal[], isSelected: boolean) =>
      update((current) => ({
        ...current,
        selection: setSelected(current.selection, proposals, isSelected),
      })),
    [update],
  );

  const edit = useCallback(
    (proposal: MetadataGenerationProposal, value: string | null) =>
      update((current) => ({
        selection: setSelected(current.selection, [proposal], true),
        edits: setEdit(current.edits, proposal.id, value),
      })),
    [update],
  );

  const reset = useCallback(() => update(() => EMPTY_DRAFT), [update]);

  return {
    selection: draft.selection,
    edits: draft.edits,
    select,
    edit,
    reset,
  };
}

type ReviewContentProps = {
  databaseId: DatabaseId;
  tables: MetadataGenerationProposalTable[];
  draft: ReviewDraftState;
  applyResult: MetadataGenerationApplyResult | null;
  onDismissApplyResult: () => void;
};

function ReviewContent({
  databaseId,
  tables,
  draft,
  applyResult,
  onDismissApplyResult,
}: ReviewContentProps) {
  const [selectedTableId, setSelectedTableId] =
    useState<ConcreteTableId | null>(null);
  const [detailFieldId, setDetailFieldId] = useState<FieldId | null>(null);
  const [listWidth, setListWidth] = useState(DEFAULT_LIST_WIDTH);
  const [paneWidth, setPaneWidth] = useState(DEFAULT_PANE_WIDTH);
  const [hoveredSide, setHoveredSide] = useState<ResizeSide | null>(null);
  const dragStartWidth = useRef(0);
  const humanSetPending = getHumanSetPendingCount(tables);
  const displayNames = useTableDisplayNames(databaseId);

  const selectedTable =
    tables.find((table) => table.table_id === selectedTableId) ?? tables[0];

  return (
    <Stack gap="md" data-testid="metadata-generation-review">
      {humanSetPending > 0 && (
        <Text size="sm" c="text-secondary">
          {ngettext(
            msgid`${humanSetPending} suggestion would replace a value a person set. Select it on its own row to accept it.`,
            `${humanSetPending} suggestions would replace values a person set. Select them one by one to accept them.`,
            humanSetPending,
          )}
        </Text>
      )}
      {applyResult && (
        <ApplyResult
          databaseId={databaseId}
          result={applyResult}
          onDismiss={onDismissApplyResult}
        />
      )}
      <Flex gap="lg" h="65vh" mih={0}>
        <ScrollArea style={{ flex: `0 0 ${listWidth}px` }}>
          <TableList
            tables={tables}
            displayNames={displayNames}
            selectedTableId={selectedTable.table_id}
            onSelect={(tableId) => {
              setSelectedTableId(tableId);
              setDetailFieldId(null);
            }}
          />
        </ScrollArea>
        <Box className={S.resizable}>
          <ResizeHandle
            side="left"
            onHoverChange={setHoveredSide}
            onDragStart={() => (dragStartWidth.current = listWidth)}
            onDrag={(deltaX) =>
              setListWidth(
                clamp(
                  dragStartWidth.current + deltaX,
                  MIN_LIST_WIDTH,
                  MAX_LIST_WIDTH,
                ),
              )
            }
          />
          <TableReview
            key={selectedTable.table_id}
            table={selectedTable}
            draft={draft}
            detailFieldId={detailFieldId}
            hoveredSide={hoveredSide}
            onToggleFieldDetails={(fieldId) =>
              setDetailFieldId((current) =>
                current === fieldId ? null : fieldId,
              )
            }
          />
          {detailFieldId != null && (
            <ResizeHandle
              side="right"
              onHoverChange={setHoveredSide}
              onDragStart={() => (dragStartWidth.current = paneWidth)}
              onDrag={(deltaX) =>
                setPaneWidth(
                  clamp(
                    dragStartWidth.current - deltaX,
                    MIN_PANE_WIDTH,
                    MAX_PANE_WIDTH,
                  ),
                )
              }
            />
          )}
        </Box>
        {detailFieldId != null && (
          <FieldDetailsPane
            key={detailFieldId}
            tableId={selectedTable.table_id}
            fieldId={detailFieldId}
            width={paneWidth}
            onClose={() => setDetailFieldId(null)}
          />
        )}
      </Flex>
    </Stack>
  );
}

const DEFAULT_LIST_WIDTH = 240;
const MIN_LIST_WIDTH = 180;
const MAX_LIST_WIDTH = 560;
const DEFAULT_PANE_WIDTH = 416;
const MIN_PANE_WIDTH = 280;
const MAX_PANE_WIDTH = 720;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The display names of the database's tables, by table id. */
function useTableDisplayNames(databaseId: DatabaseId): Record<number, string> {
  const { data: database } = useGetDatabaseMetadataQuery({
    id: databaseId,
    include_hidden: true,
    skip_fields: true,
  });
  return useMemo(
    () =>
      Object.fromEntries(
        (database?.tables ?? []).map((table) => [table.id, table.display_name]),
      ),
    [database],
  );
}

type ResizeSide = "left" | "right";

type ResizeHandleProps = {
  side: ResizeSide;
  onHoverChange: (side: ResizeSide | null) => void;
  onDragStart: () => void;
  /** Called with the pointer's horizontal distance from where the drag started. */
  onDrag: (deltaX: number) => void;
};

/** An invisible grip over one vertical border of the proposals card. */
function ResizeHandle({
  side,
  onHoverChange,
  onDragStart,
  onDrag,
}: ResizeHandleProps) {
  const startX = useRef(0);

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label={
        side === "left" ? t`Resize the table list` : t`Resize the field details`
      }
      className={cx(S.handle, side === "left" ? S.handleLeft : S.handleRight)}
      onPointerEnter={() => onHoverChange(side)}
      onPointerLeave={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
          onHoverChange(null);
        }
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        startX.current = event.clientX;
        onDragStart();
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          onDrag(event.clientX - startX.current);
        }
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        onHoverChange(null);
      }}
    />
  );
}

type ReviewActionsProps = {
  databaseId: DatabaseId;
  draft: ReviewDraftState;
  onApply: (result: MetadataGenerationApplyResult) => void;
  onDiscard?: () => void;
};

/** The discard and apply actions of the modal header. */
function ReviewActions({
  databaseId,
  draft,
  onApply,
  onDiscard,
}: ReviewActionsProps) {
  const [applyProposals, { isLoading: isApplying }] =
    useApplyMetadataGenerationProposalsMutation();
  const [discardProposals, { isLoading: isDiscarding }] =
    useApplyMetadataGenerationProposalsMutation();
  const [
    isDiscardConfirmOpen,
    { open: openDiscardConfirm, close: closeDiscardConfirm },
  ] = useDisclosure();
  const { sendErrorToast } = useMetadataToasts();
  const selectedCount = draft.selection.size;

  const handleDiscard = async () => {
    closeDiscardConfirm();
    const { error } = await discardProposals({
      database_id: databaseId,
      reject_all: true,
    });
    if (error) {
      sendErrorToast(
        getErrorMessage(error, t`Failed to discard the suggestions`),
      );
    } else {
      onDiscard?.();
    }
  };

  const handleApply = async () => {
    const { data, error } = await applyProposals(
      getApplyRequestBody(draft.selection, draft.edits),
    );
    if (error) {
      sendErrorToast(
        getErrorMessage(error, t`Failed to apply the suggestions`),
      );
    } else if (data) {
      draft.reset();
      onApply(data);
    }
  };

  return (
    <>
      {onDiscard != null && (
        <Tooltip label={t`Discard all suggestions`}>
          <ActionIcon
            aria-label={t`Discard all suggestions`}
            loading={isDiscarding}
            onClick={openDiscardConfirm}
          >
            <Icon name="trash" />
          </ActionIcon>
        </Tooltip>
      )}
      <ConfirmModal
        opened={isDiscardConfirmOpen}
        title={t`Discard all suggestions?`}
        message={t`This discards every suggestion of this database, including the ones you selected or edited. A later run can suggest them again.`}
        confirmButtonText={t`Discard`}
        onConfirm={handleDiscard}
        onClose={closeDiscardConfirm}
      />
      <Button
        variant="filled"
        loading={isApplying}
        disabled={selectedCount === 0}
        onClick={handleApply}
      >
        {ngettext(
          msgid`Apply ${selectedCount} suggestion`,
          `Apply ${selectedCount} suggestions`,
          selectedCount,
        )}
      </Button>
    </>
  );
}

type ApplyResultProps = {
  databaseId: DatabaseId;
  result: MetadataGenerationApplyResult;
  onDismiss: () => void;
};

function ApplyResult({ databaseId, result, onDismiss }: ApplyResultProps) {
  const fieldLabels = useFieldLabels(databaseId, result.failures.length > 0);

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
            {t`Failed suggestions stay pending, so you can select and apply them again after you fix the cause.`}
          </Text>
          {result.failures.map((failure) => (
            <Text key={failure.proposal_id} size="sm">
              {getApplyFailureLabel(failure, fieldLabels)}
            </Text>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/** The labels of the fields that have pending proposals in the database, by field id. */
function useFieldLabels(
  databaseId: DatabaseId,
  isEnabled: boolean,
): Map<FieldId, string> {
  const { data: proposals } = useListMetadataGenerationProposalsQuery(
    isEnabled ? { database_id: databaseId } : skipToken,
  );
  return useMemo(
    () =>
      new Map(
        (proposals ?? []).map((proposal) => [
          proposal.field_id,
          getFieldLabel(proposal),
        ]),
      ),
    [proposals],
  );
}

function getApplyFailureLabel(
  failure: MetadataGenerationApplyFailure,
  fieldLabels: Map<FieldId, string>,
): string {
  const reason = getApplyFailureReasonLabel(failure.reason);
  if (failure.attribute == null) {
    return reason;
  }
  const attribute = getAttributeLabel(failure.attribute);
  const field =
    failure.field_id != null ? fieldLabels.get(failure.field_id) : undefined;
  return field != null
    ? t`${field}, ${attribute}: ${reason}`
    : t`${attribute}: ${reason}`;
}

type TableListProps = {
  tables: MetadataGenerationProposalTable[];
  displayNames: Record<number, string>;
  selectedTableId: ConcreteTableId;
  onSelect: (tableId: ConcreteTableId) => void;
};

function TableList({
  tables,
  displayNames,
  selectedTableId,
  onSelect,
}: TableListProps) {
  return (
    <Stack gap={2} data-testid="metadata-generation-review-tables">
      {tables.map((table) => (
        <NavLink
          key={table.table_id}
          className={S.tableLink}
          classNames={{ description: S.tableLinkDescription }}
          active={table.table_id === selectedTableId}
          label={displayNames[table.table_id] ?? getTableLabel(table)}
          description={getTableCountsLabel(table)}
          rightSection={
            table.human_set_pending > 0 ? (
              <Tooltip
                label={ngettext(
                  msgid`${table.human_set_pending} suggestion would replace a value a person set`,
                  `${table.human_set_pending} suggestions would replace values a person set`,
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

function getTableCountsLabel(table: MetadataGenerationProposalTable): string {
  return ngettext(
    msgid`${table.pending} suggestion`,
    `${table.pending} suggestions`,
    table.pending,
  );
}

type TableReviewProps = {
  table: MetadataGenerationProposalTable;
  draft: ReviewDraftState;
  /** The field whose details pane is open. */
  detailFieldId: FieldId | null;
  /** The card border a resize grip is over, which it draws stronger. */
  hoveredSide: ResizeSide | null;
  onToggleFieldDetails: (fieldId: FieldId) => void;
};

type ProposalRowNode = {
  id: string;
  kind: "proposal";
  proposal: MetadataGenerationProposal;
};

/** A header row naming the field of the proposal rows below it. */
type GroupRowNode = {
  id: string;
  kind: "group";
  fieldId: FieldId;
  label: string;
};

type ProposalNode = ProposalRowNode | GroupRowNode;

function TableReview({
  table,
  draft,
  detailFieldId,
  hoveredSide,
  onToggleFieldDetails,
}: TableReviewProps) {
  const { selection, edits, select, edit } = draft;
  const [query, setQuery] = useState("");
  const {
    data: proposals,
    error,
    isLoading,
  } = useListMetadataGenerationProposalsQuery({ table_id: table.table_id });

  // Group by field when any field has more than one proposal.
  const isGrouped = useMemo(
    () => hasFieldWithSeveralProposals(proposals ?? []),
    [proposals],
  );
  const rows = useMemo(
    () =>
      getNodes(
        (proposals ?? []).filter((proposal) =>
          matchesQuery(proposal, edits, query),
        ),
        isGrouped,
      ),
    [proposals, edits, query, isGrouped],
  );
  const [sticky, setSticky] = useState<StickyHeader | null>(null);
  const tableCheckbox = useMemo(
    () => getTableCheckboxState(proposals ?? [], selection),
    [proposals, selection],
  );
  const bulkProposals = useMemo(
    () => getBulkDecidable(proposals ?? []),
    [proposals],
  );
  const columns = useMemo(
    () =>
      getColumns({
        tableCheckbox,
        bulkProposals,
        isGrouped,
        selection,
        edits,
        select,
        edit,
        detailFieldId,
        onToggleFieldDetails,
      }),
    [
      tableCheckbox,
      bulkProposals,
      isGrouped,
      selection,
      edits,
      select,
      edit,
      detailFieldId,
      onToggleFieldDetails,
    ],
  );
  const instance = useTreeTableInstance<ProposalNode>({
    data: rows,
    columns,
    getNodeId: (node) => node.id,
  });
  useStickyGroupHeader(instance, rows, setSticky);

  return (
    <Stack gap="sm" flex={1} miw={0} mih={0}>
      <TextInput
        value={query}
        placeholder={t`Search suggestions`}
        aria-label={t`Search suggestions`}
        leftSection={<Icon name="search" />}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <Card
        withBorder
        p={0}
        flex={1}
        miw={0}
        mih={0}
        display="flex"
        className={S.card}
        data-hover-side={hoveredSide ?? undefined}
        pos="relative"
      >
        {error != null && (
          <Text c="feedback-negative" p="md">
            {getErrorMessage(error)}
          </Text>
        )}
        {isLoading && <Loader size="sm" m="md" />}
        {sticky != null && (
          <Box
            className={S.stickyHeader}
            style={{ top: sticky.top }}
            aria-hidden
            data-testid="metadata-generation-sticky-field"
          >
            <Text fw="bold" className={S.groupLabel}>
              {sticky.label}
            </Text>
          </Box>
        )}
        {proposals != null && (
          <TreeTable
            instance={instance}
            hierarchical={false}
            classNames={{
              root: S.proposals,
              row: S.proposalRow,
              rowActive: S.proposalRowActive,
              cell: S.proposalCell,
            }}
            ariaLabel={t`Suggestions of ${getTableLabel(table)}`}
            getRowProps={getRowProps}
            emptyState={
              <Text c="text-secondary" p="md">
                {query
                  ? t`No suggestions match.`
                  : t`No suggestions for this table.`}
              </Text>
            }
          />
        )}
      </Card>
    </Stack>
  );
}

type StickyHeader = {
  label: string;
  /** Offset of the overlay from the top of the card: the height of the column headers. */
  top: number;
};

/**
 * Shows a copy of the header row of the field whose own header has scrolled under the column headers,
 * as an overlay, until the next field's header reaches the top. The overlay is outside the table, so
 * showing it changes no layout and moves no scroll position.
 */
function useStickyGroupHeader(
  instance: TreeTableInstance<ProposalNode>,
  rows: ProposalNode[],
  onChange: (sticky: StickyHeader | null) => void,
) {
  const instanceRef = useRef(instance);
  instanceRef.current = instance;
  const lastRef = useRef<StickyHeader | null>(null);

  useEffect(() => {
    const container = instanceRef.current.containerRef.current;
    if (container == null) {
      return;
    }
    const update = () => {
      const { virtualizer, centerRows } = instanceRef.current;
      const scrollTop = container.scrollTop;
      const topItem = virtualizer.getVirtualItemForOffset(scrollTop);
      const group = getScrolledPastGroup(centerRows, topItem, scrollTop);
      const headerHeight = container.firstElementChild?.clientHeight ?? 0;
      const next = group ? { label: group.label, top: headerHeight } : null;
      // Scroll events are frequent; only a change re-renders the table.
      if (
        next?.label !== lastRef.current?.label ||
        next?.top !== lastRef.current?.top
      ) {
        lastRef.current = next;
        onChange(next);
      }
    };
    update();
    container.addEventListener("scroll", update, { passive: true });
    return () => container.removeEventListener("scroll", update);
  }, [rows, onChange]);
}

/** The last header row at or above `topItem` whose own row has started to leave the viewport. */
function getScrolledPastGroup(
  centerRows: Row<ProposalNode>[],
  topItem: VirtualItem | undefined,
  scrollTop: number,
): GroupRowNode | null {
  if (topItem == null) {
    return null;
  }
  for (
    let index = Math.min(topItem.index, centerRows.length - 1);
    index >= 0;
    index--
  ) {
    const node = centerRows[index].original;
    if (node.kind !== "group") {
      continue;
    }
    const isLeaving = index < topItem.index || topItem.start < scrollTop;
    return isLeaving ? node : null;
  }
  return null;
}

function hasFieldWithSeveralProposals(
  proposals: MetadataGenerationProposal[],
): boolean {
  const counts = new Map<FieldId, number>();
  for (const { field_id } of proposals) {
    counts.set(field_id, (counts.get(field_id) ?? 0) + 1);
  }
  return [...counts.values()].some((count) => count > 1);
}

/** The rows of the table: proposals, each field's run of them led by a header row when `isGrouped`. */
function getNodes(
  proposals: MetadataGenerationProposal[],
  isGrouped: boolean,
): ProposalNode[] {
  return proposals.flatMap((proposal, index, all) => {
    const row: ProposalRowNode = {
      id: `proposal-${proposal.id}`,
      kind: "proposal",
      proposal,
    };
    const isFirstOfField =
      index === 0 || all[index - 1].field_id !== proposal.field_id;
    if (!isGrouped || !isFirstOfField) {
      return [row];
    }
    const group: GroupRowNode = {
      id: `field-${proposal.field_id}`,
      kind: "group",
      fieldId: proposal.field_id,
      label: getFieldLabel(proposal),
    };
    return [group, row];
  });
}

function matchesQuery(
  proposal: MetadataGenerationProposal,
  edits: ProposalEdits,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return true;
  }
  const haystack = [
    proposal.field_name,
    proposal.field_display_name,
    getAttributeLabel(proposal.attribute),
    formatProposalValue(proposal.attribute, proposal.current_value),
    formatProposalValue(proposal.attribute, getProposalValue(proposal, edits)),
  ];
  return haystack.some((text) => text?.toLowerCase().includes(needle));
}

function getRowProps(row: Row<ProposalNode>): Record<string, unknown> {
  const node = row.original;
  if (node.kind === "group") {
    return {
      "data-testid": "metadata-generation-field-group",
      "data-group": true,
    };
  }
  return {
    "data-testid": "metadata-generation-suggestion",
    "data-human-set": isHumanSet(node.proposal),
  };
}

type ColumnOptions = {
  tableCheckbox: TableCheckboxState;
  /** The proposals that the table checkbox ticks and unticks. */
  bulkProposals: MetadataGenerationProposal[];
  isGrouped: boolean;
  selection: ProposalSelection;
  edits: ProposalEdits;
  select: ReviewDraftState["select"];
  edit: ReviewDraftState["edit"];
  detailFieldId: FieldId | null;
  onToggleFieldDetails: (fieldId: FieldId) => void;
};

type ProposalCell = (proposal: MetadataGenerationProposal) => ReactNode;

/** A cell that renders for proposal rows only; group rows leave it empty. */
function proposalCell(render: ProposalCell) {
  return ({ row }: { row: Row<ProposalNode> }) =>
    row.original.kind === "proposal" ? render(row.original.proposal) : null;
}

function getColumns({
  tableCheckbox,
  bulkProposals,
  isGrouped,
  selection,
  edits,
  select,
  edit,
  detailFieldId,
  onToggleFieldDetails,
}: ColumnOptions): TreeTableColumnDef<ProposalNode>[] {
  const fieldColumn: TreeTableColumnDef<ProposalNode> = {
    id: "field",
    header: t`Field`,
    width: 180,
    cell: proposalCell((proposal) => {
      const fieldLabel = getFieldLabel(proposal);
      return (
        <Text fw="bold" title={fieldLabel} truncate>
          {fieldLabel}
        </Text>
      );
    }),
  };

  return [
    {
      id: "accept",
      header: () => (
        <Tooltip
          label={t`Selects or clears every suggestion of this table, except those that would replace a value a person set.`}
        >
          <Box component="span" display="inline-flex">
            <Checkbox
              aria-label={t`Accept the suggestions of this table`}
              checked={tableCheckbox.checked}
              indeterminate={tableCheckbox.indeterminate}
              disabled={tableCheckbox.disabled}
              onChange={() => select(bulkProposals, !tableCheckbox.checked)}
            />
          </Box>
        </Tooltip>
      ),
      width: 48,
      cell: ({ row }) => {
        const node = row.original;
        if (node.kind === "group") {
          // The group label overflows into the empty cells beside it.
          return (
            <Text fw="bold" className={S.groupLabel}>
              {node.label}
            </Text>
          );
        }
        return (
          <AcceptCell
            proposal={node.proposal}
            isChecked={selection.has(node.proposal.id)}
            select={select}
          />
        );
      },
    },
    ...(isGrouped ? [] : [fieldColumn]),
    {
      id: "attribute",
      header: t`Attribute`,
      width: 150,
      cell: proposalCell((proposal) => {
        const attributeLabel = getAttributeLabel(proposal.attribute);
        return (
          <Text title={attributeLabel} truncate>
            {attributeLabel}
          </Text>
        );
      }),
    },
    {
      id: "current",
      header: t`Current value`,
      width: 180,
      cell: proposalCell((proposal) => <CurrentValue proposal={proposal} />),
    },
    {
      id: "proposed",
      header: t`Suggested`,
      minWidth: 440,
      cell: proposalCell((proposal) => (
        <Stack gap={4} align="flex-start" py="xs">
          <ProposedValue proposal={proposal} edits={edits} edit={edit} />
        </Stack>
      )),
    },
    {
      id: "explanation",
      // Centred like the icons below it, which a plain header is not.
      header: () => (
        <Center w="100%">
          <SortableHeaderPill name={t`Explanation`} />
        </Center>
      ),
      width: 120,
      cell: proposalCell(({ reasoning }) =>
        reasoning ? (
          <Center w="100%">
            <Tooltip label={reasoning} maw="25rem" multiline>
              <Icon
                name="comment"
                c="text-secondary"
                aria-label={t`Explanation`}
                aria-hidden={false}
              />
            </Tooltip>
          </Center>
        ) : null,
      ),
    },
    {
      id: "details",
      header: "",
      width: 64,
      cell: proposalCell((proposal) => {
        const isDetailOpen = proposal.field_id === detailFieldId;
        return (
          <Tooltip
            label={isDetailOpen ? t`Hide field details` : t`Field details`}
          >
            <ActionIcon
              aria-label={t`Field details of ${getFieldLabel(proposal)}`}
              aria-pressed={isDetailOpen}
              selected={isDetailOpen}
              onClick={() => onToggleFieldDetails(proposal.field_id)}
            >
              <Icon name="info" />
            </ActionIcon>
          </Tooltip>
        );
      }),
    },
  ];
}

type AcceptCellProps = {
  proposal: MetadataGenerationProposal;
  isChecked: boolean;
  select: ReviewDraftState["select"];
};

function AcceptCell({ proposal, isChecked, select }: AcceptCellProps) {
  const attributeLabel = getAttributeLabel(proposal.attribute);
  const fieldLabel = getFieldLabel(proposal);

  return (
    <Checkbox
      aria-label={t`Accept ${attributeLabel} of ${fieldLabel}`}
      checked={isChecked}
      onChange={() => select([proposal], !isChecked)}
    />
  );
}

function CurrentValue({ proposal }: { proposal: MetadataGenerationProposal }) {
  const current = formatProposalValue(
    proposal.attribute,
    proposal.current_value,
  );
  return (
    <Stack gap={4} align="flex-start" py="xs">
      {current != null ? (
        <Text>{current}</Text>
      ) : (
        <Text c="text-secondary">{t`Empty`}</Text>
      )}
      {isHumanSet(proposal) && (
        <Badge variant="light" color="warning">{t`Set by a person`}</Badge>
      )}
      {proposal.source === "ai" && (
        <Badge variant="light" color="neutral">{t`Set by AI`}</Badge>
      )}
    </Stack>
  );
}

type ProposedValueProps = {
  proposal: MetadataGenerationProposal;
  edits: ProposalEdits;
  edit: ReviewDraftState["edit"];
};

function ProposedValue({ proposal, edits, edit }: ProposedValueProps) {
  const { attribute, proposed_value } = proposal;
  const value = getProposalValue(proposal, edits);
  const isEdited = isProposalEdited(proposal, edits);
  const attributeLabel = getAttributeLabel(attribute);
  const fieldLabel = getFieldLabel(proposal);

  const save = (newValue: string | null) =>
    edit(proposal, newValue === proposed_value ? null : newValue);

  const proposedLabel = formatProposalValue(attribute, proposed_value);

  return (
    <Group
      gap={8}
      wrap="nowrap"
      align="flex-start"
      data-testid="metadata-generation-proposed"
      onKeyDown={keepKeysInEditor}
    >
      <ValueInput
        proposal={proposal}
        value={value}
        label={t`Suggested ${attributeLabel} of ${fieldLabel}`}
        onChange={save}
      />
      {isEdited && (
        <Tooltip
          label={t`Use the AI suggestion: ${proposedLabel}`}
          maw="25rem"
          multiline
        >
          <ActionIcon
            aria-label={t`Use the AI suggestion for ${attributeLabel} of ${fieldLabel}`}
            onClick={() => save(null)}
          >
            <Icon name="revert" />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}

/**
 * The table's keyboard navigation handles Space, Enter and the arrows on its root, which would otherwise
 * swallow them while typing in a proposal. Escape still bubbles so the editors and the modal see it.
 */
function keepKeysInEditor(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

/** Every proposed-value input has the same width, whatever its kind. */
const INPUT_WIDTH = "24rem";

type ValueInputProps = {
  proposal: MetadataGenerationProposal;
  value: string;
  label: string;
  onChange: (value: string) => void;
};

function ValueInput({ proposal, value, label, onChange }: ValueInputProps) {
  switch (proposal.attribute) {
    case "description":
      return (
        <DescriptionInput
          // Reset the draft when the saved value changes, e.g. after "Use the AI suggestion".
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
            base_type: proposal.field_base_type,
            effective_type: proposal.field_effective_type ?? undefined,
          }}
          value={value}
          canSetKeyOrEmpty={false}
          w={INPUT_WIDTH}
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
          w={INPUT_WIDTH}
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
      w={INPUT_WIDTH}
      onChange={(event) => setText(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  );
}

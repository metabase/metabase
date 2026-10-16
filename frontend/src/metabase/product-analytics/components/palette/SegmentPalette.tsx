import { type HTMLAttributes, type Ref, forwardRef, useState } from "react";
import { Resizable, type ResizeCallbackData } from "react-resizable";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import {
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Icon,
  Loader,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type { ConcreteTableId, Table } from "metabase-types/api";

import type { UsersTable } from "../../analyses/types";
import { useEventDropTarget } from "../../segments/drag-context";
import type {
  PaletteSegment,
  SamplePaletteSegment,
  SegmentDraft,
  SegmentSource,
} from "../../segments/types";
import {
  getSamplePeopleSegments,
  usePaletteSegments,
} from "../../segments/use-palette-segments";
import { useSegmentDrafts } from "../../segments/use-segment-drafts";
import { EventTablePicker } from "../EventTablePicker";
import { EventDefinitionEditor } from "../events/EventDefinitionEditor";
import { useTableQuery } from "../events/use-table-query";

import { NewSegmentModal } from "./NewSegmentModal";
import { PaletteSegmentItem } from "./PaletteSegmentItem";
import S from "./SegmentPalette.module.css";

const DEFAULT_WIDTH = 272;
const MIN_WIDTH = 240;
const MAX_WIDTH = 400;

type SegmentPaletteProps = {
  tableId: ConcreteTableId | undefined;
  table: Table | undefined;
  usersTable: UsersTable | undefined;
  isTableLoading: boolean;
  tableError: string | undefined;
  /** Absent when the table is fixed, as it is for a saved analysis. */
  onTableChange?: (tableId: ConcreteTableId) => void;
  /** A click on a people segment, which adds it as a filter. */
  onSelectPeopleSegment: (segment: PaletteSegment) => void;
};

/**
 * The recessed panel on the far left: the event table, then its segments and
 * the linked people table's, each draggable onto the setup panel's slots.
 * The toolbar's segments button shows and hides it.
 */
export const SegmentPalette = ({
  tableId,
  table,
  usersTable,
  isTableLoading,
  tableError,
  onTableChange,
  onSelectPeopleSegment,
}: SegmentPaletteProps) => {
  const peopleTitle = getPeopleTitle(usersTable);
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  const handleResize = (_event: unknown, data: ResizeCallbackData) =>
    setWidth(data.size.width);

  return (
    <Resizable
      width={width}
      height={0}
      axis="x"
      minConstraints={[MIN_WIDTH, 0]}
      maxConstraints={[MAX_WIDTH, 0]}
      resizeHandles={["e"]}
      handle={<PaletteResizeHandle />}
      onResize={handleResize}
    >
      <Stack className={S.root} w={width} pos="relative" gap={0}>
        <Text fw="bold" c="text-secondary" px="md" pt="md" pb="xs">
          {t`Event data`}
        </Text>
        <Box px="md">
          {onTableChange !== undefined ? (
            <EventTablePicker
              tableId={tableId}
              isLoading={isTableLoading}
              onChange={onTableChange}
              size="md"
              fullWidth
            />
          ) : (
            <Group gap="sm" wrap="nowrap">
              <Icon name="database" />
              <Text fw="bold" truncate>
                {table?.display_name ?? t`Loading…`}
              </Text>
            </Group>
          )}
          {tableError !== undefined && (
            <Alert mt="sm" color="error" icon={<Icon name="warning" />}>
              {tableError}
            </Alert>
          )}
        </Box>
        <Divider my="md" />
        <ScrollArea flex={1} mih={0}>
          <Stack gap="xl" pb="lg">
            <PaletteSection
              title={t`Event segments`}
              source="event"
              table={table}
              emptyMessage={t`No segments on this table yet.`}
            />
            <PaletteSection
              title={peopleTitle}
              source="people"
              table={usersTable?.table}
              samples={
                usersTable === undefined ? getSamplePeopleSegments() : []
              }
              emptyMessage={t`No segments on this table yet.`}
              onSelect={onSelectPeopleSegment}
            />
          </Stack>
        </ScrollArea>
      </Stack>
    </Resizable>
  );
};

type PaletteResizeHandleProps = HTMLAttributes<HTMLDivElement> & {
  /** Passed by `Resizable`; a div can't take it. */
  handleAxis?: string;
};

/** The grab strip on the palette's right edge. `Resizable` attaches the drag. */
const PaletteResizeHandle = forwardRef(function PaletteResizeHandle(
  { handleAxis: _handleAxis, ...rest }: PaletteResizeHandleProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <Box
      ref={ref}
      className={S.handle}
      pos="absolute"
      top={0}
      right={-4}
      w="sm"
      h="100%"
      {...rest}
    />
  );
});

const getPeopleTitle = (usersTable: UsersTable | undefined): string => {
  const name = usersTable?.table.display_name ?? "";
  return /user/i.test(name) ? t`User segments` : t`Customer segments`;
};

type PaletteSectionProps = {
  title: string;
  source: SegmentSource;
  /** Undefined when there's no such table; only `samples` are shown then. */
  table: Table | undefined;
  samples?: SamplePaletteSegment[];
  emptyMessage: string;
  /** When given, clicking a segment uses it. */
  onSelect?: (segment: PaletteSegment) => void;
};

type ModalState = { draft: SegmentDraft } | null;

const PaletteSection = ({
  title,
  source,
  table,
  samples = [],
  emptyMessage,
  onSelect,
}: PaletteSectionProps) => {
  const [sendToast] = useToast();
  const tableQuery = useTableQuery(table);
  const { drafts, addDraft, removeDraft } = useSegmentDrafts(table?.id);
  const { saved, drafted, isLoading } = usePaletteSegments(
    table?.id,
    source,
    drafts,
  );
  const [isDrafting, setIsDrafting] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  // An event dragged out of the setup panel lands here as a draft.
  const takesEvents = source === "event" && table !== undefined;
  const eventDrop = useEventDropTarget({
    onDrop: (event) => {
      if (takesEvents) {
        addDraft(event);
      }
    },
  });
  const eventDropProps = takesEvents ? eventDrop.dropProps : {};
  const items: PaletteSegment[] = [...saved, ...drafted, ...samples];
  const canEdit = table !== undefined && tableQuery !== undefined;
  const disabledHint =
    table === undefined
      ? t`Link a Customers or Users table to the person column first.`
      : undefined;

  return (
    <Stack className={S.section} gap="xs" px="md" py="xs" {...eventDropProps}>
      <Group justify="space-between" wrap="nowrap" mb="xs">
        <Text fw="bold">{title}</Text>
        {isLoading && <Loader size="xs" />}
      </Group>
      {takesEvents && eventDrop.isActive && (
        <Text c="text-brand" fw="bold">
          {t`Drop to draft a segment from it`}
        </Text>
      )}
      {items.map((segment) => (
        <PaletteSegmentItem
          key={segment.key}
          segment={segment}
          onSelect={
            onSelect !== undefined ? () => onSelect(segment) : undefined
          }
          onSaveDraft={() => {
            const draft = drafts.find((d) => d.id === segment.key);
            if (draft !== undefined) {
              setModal({ draft });
            }
          }}
          onDiscardDraft={() => removeDraft(segment.key)}
        />
      ))}
      {items.length === 0 && !isDrafting && !isLoading && (
        <Text c="text-tertiary">{emptyMessage}</Text>
      )}
      {isDrafting && tableQuery !== undefined && (
        <EventDefinitionEditor
          value={null}
          tableQuery={tableQuery}
          namePlaceholder={t`Name this draft`}
          onCancel={() => setIsDrafting(false)}
          onSubmit={(event) => {
            addDraft(event);
            setIsDrafting(false);
          }}
        />
      )}
      <Box mt="xs">
        <Tooltip label={disabledHint} disabled={disabledHint === undefined}>
          <Button
            size="compact-md"
            variant="subtle"
            leftSection={<Icon name="add" />}
            disabled={!canEdit || isDrafting}
            onClick={() => setIsDrafting(true)}
          >
            {t`Draft a segment`}
          </Button>
        </Tooltip>
      </Box>
      {modal !== null && table !== undefined && tableQuery !== undefined && (
        <NewSegmentModal
          table={table}
          tableQuery={tableQuery}
          draft={modal.draft}
          onClose={() => setModal(null)}
          onCreated={(segment) => {
            removeDraft(modal.draft.id);
            setModal(null);
            sendToast({ message: t`Created the segment “${segment.name}”` });
          }}
        />
      )}
    </Stack>
  );
};

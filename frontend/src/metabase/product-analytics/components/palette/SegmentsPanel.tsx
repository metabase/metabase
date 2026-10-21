import { useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import {
  Box,
  Button,
  Icon,
  Loader,
  Paper,
  Stack,
  Tabs,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import type { Table } from "metabase-types/api";

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
import { ResizeHandle } from "../ResizeHandle";
import { EventDefinitionEditor } from "../events/EventDefinitionEditor";
import { useTableQuery } from "../events/use-table-query";

import { NewSegmentModal } from "./NewSegmentModal";
import { PaletteSegmentItem } from "./PaletteSegmentItem";
import { SegmentDefinition } from "./SegmentDefinition";
import S from "./SegmentsPanel.module.css";

const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 272;

type SegmentsPanelProps = {
  table: Table | undefined;
  usersTable: UsersTable | undefined;
  /** A click on a people segment, which adds it as a filter. */
  onSelectPeopleSegment: (segment: PaletteSegment) => void;
};

/**
 * The column left of the setup panel: the event table's segments and the
 * linked people table's, each draggable onto the setup panel's slots. The
 * button beside the toolbar's table picker shows and hides it.
 */
export const SegmentsPanel = ({
  table,
  usersTable,
  onSelectPeopleSegment,
}: SegmentsPanelProps) => {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  return (
    <Paper withBorder radius="md" className={S.root} w={width}>
      <ResizeHandle
        className={S.handle}
        getSize={() => width}
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        onResize={setWidth}
      />
      {/* The same header as the setup panel's, so both tab bars line up. */}
      <Title order={5} px="lg" pt="lg" pb="md">
        {t`Segments`}
      </Title>
      <Tabs defaultValue="event" className={S.tabs}>
        <Tabs.List px="lg">
          <Tabs.Tab value="event">{t`Events`}</Tabs.Tab>
          <Tabs.Tab value="people">{t`People`}</Tabs.Tab>
        </Tabs.List>
        <Box className={S.scroll}>
          <Tabs.Panel value="event" py="md">
            <PaletteSection
              source="event"
              table={table}
              emptyMessage={t`No segments on this table yet.`}
            />
          </Tabs.Panel>
          <Tabs.Panel value="people" py="md">
            <PaletteSection
              source="people"
              table={usersTable?.table}
              samples={
                usersTable === undefined ? getSamplePeopleSegments() : []
              }
              emptyMessage={t`No segments on this table yet.`}
              onSelect={onSelectPeopleSegment}
            />
          </Tabs.Panel>
        </Box>
      </Tabs>
    </Paper>
  );
};

type PaletteSectionProps = {
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
  source,
  table,
  samples = [],
  emptyMessage,
  onSelect,
}: PaletteSectionProps) => {
  const [sendToast] = useToast();
  const tableQuery = useTableQuery(table);
  const { drafts, addDraft, updateDraft, removeDraft, restoreDraft } =
    useSegmentDrafts(table?.id);
  const { saved, drafted, isLoading } = usePaletteSegments(
    table?.id,
    source,
    drafts,
  );
  const [isDrafting, setIsDrafting] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const findDraft = (key: string) => drafts.find((d) => d.id === key);
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
      {isLoading && <Loader size="xs" />}
      {takesEvents && eventDrop.isActive && (
        <Text c="text-brand" fw="bold">
          {t`Drop to draft a segment from it`}
        </Text>
      )}
      {items.map((segment) => {
        const editingDraft =
          segment.status === "draft" && segment.key === editingDraftId
            ? findDraft(segment.key)
            : undefined;
        if (editingDraft !== undefined && tableQuery !== undefined) {
          return (
            <EventDefinitionEditor
              key={segment.key}
              value={editingDraft}
              tableQuery={tableQuery}
              namePlaceholder={t`Name this draft`}
              onCancel={() => setEditingDraftId(null)}
              onSubmit={(event) => {
                updateDraft(editingDraft.id, event);
                setEditingDraftId(null);
              }}
            />
          );
        }
        // A click on an event draft reopens it; people segments have their
        // own click, so their drafts are edited from the menu.
        const handleSelect = (() => {
          if (onSelect !== undefined) {
            return () => onSelect(segment);
          }
          if (segment.status === "draft") {
            return () => setEditingDraftId(segment.key);
          }
          return undefined;
        })();
        return (
          <PaletteSegmentItem
            key={segment.key}
            segment={segment}
            definition={
              segment.status === "saved" ? (
                <SegmentDefinition segment={segment.segment} table={table} />
              ) : undefined
            }
            onSelect={handleSelect}
            onEditDraft={() => setEditingDraftId(segment.key)}
            onSaveDraft={() => {
              const draft = findDraft(segment.key);
              if (draft !== undefined) {
                setModal({ draft });
              }
            }}
            onDiscardDraft={() => {
              const draft = findDraft(segment.key);
              if (draft === undefined) {
                return;
              }
              removeDraft(draft.id);
              sendToast({
                message: t`Discarded the draft “${draft.name}”`,
                actionLabel: t`Undo`,
                action: () => restoreDraft(draft),
              });
            }}
          />
        );
      })}
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
      {!isDrafting && (
        <Box>
          <Tooltip label={disabledHint} disabled={disabledHint === undefined}>
            <Button
              variant="subtle"
              leftSection={<Icon name="add" />}
              disabled={!canEdit}
              onClick={() => setIsDrafting(true)}
            >
              {t`Draft a segment`}
            </Button>
          </Tooltip>
        </Box>
      )}
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

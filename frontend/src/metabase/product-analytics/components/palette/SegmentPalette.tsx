import { useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import {
  Button,
  Group,
  Icon,
  Loader,
  ScrollArea,
  Stack,
  Text,
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
import { EventDefinitionEditor } from "../events/EventDefinitionEditor";
import { useTableQuery } from "../events/use-table-query";

import { NewSegmentModal } from "./NewSegmentModal";
import { PaletteSegmentItem } from "./PaletteSegmentItem";
import S from "./SegmentPalette.module.css";

type SegmentPaletteProps = {
  /** The event table of the analysis being edited. */
  table: Table | undefined;
  /** The table its person column links to, if any. */
  usersTable: UsersTable | undefined;
  /** Lines the header up with the side panel's. */
  headerHeight: string;
};

/**
 * The recessed panel beside the side panel: the event table's segments and
 * the linked people table's. Event segments drag onto the setup panel's
 * slots; events dragged out of the setup panel become drafts here.
 */
export const SegmentPalette = ({
  table,
  usersTable,
  headerHeight,
}: SegmentPaletteProps) => (
  <Stack className={S.root} h="100%" gap={0}>
    <Group
      h={headerHeight}
      px="md"
      style={{
        flexShrink: 0,
        borderBottom: "1px solid var(--mb-color-border)",
      }}
    >
      <Text fw="bold" c="text-secondary">
        {t`Segments`}
      </Text>
    </Group>
    <ScrollArea flex={1} mih={0}>
      <Stack gap="xl" pt="md" pb="lg">
        <PaletteSection
          title={t`Event segments`}
          source="event"
          table={table}
          emptyMessage={t`No segments on this table yet.`}
        />
        <PaletteSection
          title={getPeopleTitle(usersTable)}
          source="people"
          table={usersTable?.table}
          samples={usersTable === undefined ? getSamplePeopleSegments() : []}
          emptyMessage={t`No segments on this table yet.`}
          notice={t`Filtering by these is coming soon.`}
        />
      </Stack>
    </ScrollArea>
  </Stack>
);

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
  /** Shown under the title. */
  notice?: string;
};

type ModalState = { draft: SegmentDraft } | null;

const PaletteSection = ({
  title,
  source,
  table,
  samples = [],
  emptyMessage,
  notice,
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
    isDisabled: !takesEvents,
    onDrop: addDraft,
  });
  const items: PaletteSegment[] = [...saved, ...drafted, ...samples];
  const canEdit = table !== undefined && tableQuery !== undefined;
  const disabledHint =
    table === undefined
      ? t`Link a Customers or Users table to the person column first.`
      : undefined;

  return (
    <Stack
      className={S.section}
      gap="xs"
      px="md"
      py="xs"
      {...eventDrop.dropProps}
    >
      <Group justify="space-between" wrap="nowrap" mb="xs">
        <Group gap="xs" wrap="nowrap">
          <Text fw="bold">{title}</Text>
          {isLoading && <Loader size="xs" />}
        </Group>
        <Tooltip label={disabledHint} disabled={disabledHint === undefined}>
          <Button
            size="compact-md"
            variant="subtle"
            leftSection={<Icon name="add" />}
            disabled={!canEdit || isDrafting}
            onClick={() => setIsDrafting(true)}
          >
            {t`Draft`}
          </Button>
        </Tooltip>
      </Group>
      {notice !== undefined && <Text c="text-tertiary">{notice}</Text>}
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
        const handleSelect =
          segment.status === "draft"
            ? () => setEditingDraftId(segment.key)
            : undefined;
        return (
          <PaletteSegmentItem
            key={segment.key}
            segment={segment}
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

import { useState } from "react";
import { t } from "ttag";

import { useUpdateSegmentMutation } from "metabase/api";
import { getUserCanWriteSegments } from "metabase/common/data-studio/selectors";
import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import {
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Segment, Table } from "metabase-types/api";

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
import { PanelCloseButton } from "../PanelCloseButton";
import { ResizeHandle } from "../ResizeHandle";
import { EventDefinitionEditor } from "../events/EventDefinitionEditor";
import { useTableQuery } from "../events/use-table-query";

import { NewSegmentModal } from "./NewSegmentModal";
import {
  PaletteSegmentItem,
  type SavedSegmentActions,
} from "./PaletteSegmentItem";
import { SegmentDefinition } from "./SegmentDefinition";
import S from "./SegmentsPanel.module.css";

const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 360;
/** Segments in the panel, drafts included, from which it gets a search box. */
const SEARCH_THRESHOLD = 10;

type SegmentsPanelProps = {
  /** Which segments: the event table's, or the linked people table's. */
  source: SegmentSource;
  table: Table | undefined;
  usersTable: UsersTable | undefined;
  /** A click on a people segment, which adds it as a filter. */
  onSelectPeopleSegment: (segment: PaletteSegment) => void;
  /** The toolbar button that hides this panel is hovered. */
  isHinted?: boolean;
  onClose: () => void;
};

/**
 * A column left of the setup panel with one kind of segment, each draggable
 * onto the setup panel's slots or the toolbar. Event segments are shown and
 * hidden by the button beside the table picker; people segments by the one
 * after Break out.
 */
export const SegmentsPanel = ({
  source,
  table,
  usersTable,
  onSelectPeopleSegment,
  isHinted = false,
  onClose,
}: SegmentsPanelProps) => {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const isPeople = source === "people";
  return (
    <Paper
      withBorder
      radius="md"
      className={S.root}
      w={width}
      data-hinted={isHinted}
    >
      <ResizeHandle
        className={S.handle}
        getSize={() => width}
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        onResize={setWidth}
      />
      {/* The same header as the setup panel's when it has no tabs. */}
      <Group justify="space-between" wrap="nowrap" px="lg" pt="lg">
        <Title order={4}>
          {isPeople ? t`People segments` : t`Event segments`}
        </Title>
        <PanelCloseButton onClose={onClose} />
      </Group>
      <Box className={S.scroll} py="md">
        {isPeople ? (
          <PaletteSection
            source="people"
            table={usersTable?.table}
            samples={usersTable === undefined ? getSamplePeopleSegments() : []}
            emptyMessage={t`No segments on this table yet.`}
            onSelect={onSelectPeopleSegment}
          />
        ) : (
          <PaletteSection
            source="event"
            table={table}
            emptyMessage={t`No segments on this table yet.`}
          />
        )}
      </Box>
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
  // A long list, drafts included, gets a search box at the top.
  const isSearchable = saved.length + drafted.length >= SEARCH_THRESHOLD;
  const [searchText, setSearchText] = useState("");
  const search = isSearchable ? searchText.trim().toLowerCase() : "";
  const shownItems =
    search === ""
      ? items
      : items.filter(
          (segment) =>
            // A draft being edited stays, even if its name stops matching.
            segment.key === editingDraftId ||
            segment.name.toLowerCase().includes(search),
        );
  const canEdit = table !== undefined && tableQuery !== undefined;
  const disabledHint =
    table === undefined
      ? t`Link a Customers or Users table to the person column first.`
      : undefined;
  // Who can edit or remove segments in Data Studio can do it from here.
  const canWriteSegments = useSelector(
    (state) =>
      table !== undefined && getUserCanWriteSegments(state, table.is_published),
  );
  const [updateSegment] = useUpdateSegmentMutation();

  const removeSegment = async (segment: Segment) => {
    const { error } = await updateSegment({
      id: segment.id,
      archived: true,
      revision_message: t`Removed from event analysis`,
    });
    sendToast(
      error
        ? { icon: "warning", message: t`Failed to remove segment` }
        : { icon: "check", message: t`Segment removed` },
    );
  };

  // Writers get the segment editor, its history and its Data Studio page.
  const getSavedActions = (segment: Segment): SavedSegmentActions => {
    if (!canWriteSegments || table === undefined) {
      return {};
    }
    return {
      editUrl: Urls.dataModelSegment(segment.id),
      revisionsUrl: Urls.dataModelSegmentRevisions(segment.id),
      dataStudioUrl: table.is_published
        ? Urls.dataStudioPublishedTableSegment(table.id, segment.id)
        : Urls.dataStudioDataModelSegment({
            databaseId: table.db_id,
            schemaName: table.schema,
            tableId: table.id,
            segmentId: segment.id,
          }),
      onRemove: () => removeSegment(segment),
    };
  };

  return (
    <Stack className={S.section} gap="xs" px="md" py="xs" {...eventDropProps}>
      {isLoading && <Loader size="xs" />}
      {isSearchable && (
        <TextInput
          value={searchText}
          placeholder={t`Search segments…`}
          aria-label={t`Search segments`}
          leftSection={<Icon name="search" />}
          onChange={(event) => setSearchText(event.currentTarget.value)}
        />
      )}
      {takesEvents && eventDrop.isActive && (
        <Text c="text-brand" fw="bold">
          {t`Drop to draft a segment from it`}
        </Text>
      )}
      {shownItems.map((segment) => {
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
            savedActions={
              segment.status === "saved"
                ? getSavedActions(segment.segment)
                : undefined
            }
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
        <Text c="text-disabled">{emptyMessage}</Text>
      )}
      {items.length > 0 && shownItems.length === 0 && (
        <Text c="text-disabled">{t`No segments match “${searchText.trim()}”.`}</Text>
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
              variant="light"
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

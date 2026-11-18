import { useState } from "react";
import { c, t } from "ttag";

import { useUpdateSegmentMutation } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import {
  canAccessDataStudio,
  getUserCanWriteSegments,
} from "metabase/common/data-studio/selectors";
import { useToast } from "metabase/common/hooks";
import { UsersTablePrompt } from "metabase/event-tables";
import { useSelector } from "metabase/redux";
import {
  Box,
  Button,
  Center,
  Group,
  Icon,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type * as Lib from "metabase-lib";
import type { FieldId, Segment, Table } from "metabase-types/api";

import type { UsersTable } from "../../analyses/types";
import { getEventNameFieldId, toSearchText } from "../../events/event-name";
import type { EventDefinition } from "../../events/types";
import { useEventDropTarget } from "../../segments/drag-context";
import type {
  PaletteSegment,
  SegmentDraft,
  SegmentSource,
} from "../../segments/types";
import { useEventNameSeeds } from "../../segments/use-event-name-seeds";
import { usePaletteSegments } from "../../segments/use-palette-segments";
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
/** Brings an editor into view as it opens, e.g. at the end of a long list. */
const scrollIntoView = (node: HTMLElement | null) => {
  node?.scrollIntoView({ block: "nearest" });
};

/** Segments in the panel, drafts included, from which it gets a search box. */
const SEARCH_THRESHOLD = 10;

type SegmentsPanelProps = {
  /** Which segments: the event table's, or the linked people table's. */
  source: SegmentSource;
  table: Table | undefined;
  usersTable: UsersTable | undefined;
  /** The event table links to a people table, which may still be loading. */
  isUsersTableLinked: boolean;
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
  isUsersTableLinked,
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
      <Box className={S.scroll} pt="md">
        {isPeople ? (
          <PeopleSection
            table={table}
            usersTable={usersTable}
            isUsersTableLinked={isUsersTableLinked}
          />
        ) : (
          <EventSection table={table} />
        )}
      </Box>
    </Paper>
  );
};

/** Fills the panel's body, centered, like Data Studio's table pages. */
const SectionLoader = ({ error }: { error?: unknown }) => (
  <Center h="100%">
    <DelayedLoadingAndErrorWrapper loading={error == null} error={error} />
  </Center>
);

const EventSection = ({ table }: Pick<SegmentsPanelProps, "table">) =>
  table !== undefined ? (
    <PaletteSection source="event" table={table} />
  ) : (
    <SectionLoader />
  );

type PeopleSectionProps = Pick<
  SegmentsPanelProps,
  "table" | "usersTable" | "isUsersTableLinked"
>;

/** The people table's segments, or how to link one while there's none. */
const PeopleSection = ({
  table,
  usersTable,
  isUsersTableLinked,
}: PeopleSectionProps) => {
  if (table !== undefined && !isUsersTableLinked) {
    return (
      <Box px="lg" py="xs">
        <UsersTablePrompt table={table} />
      </Box>
    );
  }
  if (usersTable === undefined) {
    return <SectionLoader />;
  }
  return <PaletteSection source="people" table={usersTable.table} />;
};

type PaletteSectionProps = {
  source: SegmentSource;
  table: Table;
};

type ModalState = { draft: SegmentDraft } | null;

/**
 * The table's saved segments, then the user's drafts, then for event segments
 * a draft per event name not used yet. A new draft is drafted where it will
 * land, after the user's other drafts.
 */
const PaletteSection = ({ source, table }: PaletteSectionProps) => {
  const [sendToast] = useToast();
  const tableQuery = useTableQuery(table);
  const { drafts, addDraft, updateDraft, removeDraft, restoreDraft } =
    useSegmentDrafts(table.id);
  const { saved, drafted, isLoading, error } = usePaletteSegments(
    table.id,
    source,
    drafts,
  );
  // An event dragged out of the setup panel lands here as a draft.
  const takesEvents = source === "event";
  const eventTable = takesEvents ? table : undefined;
  const eventNameFieldId = getEventNameFieldId(eventTable);
  const seeds = useEventNameSeeds({
    table: eventTable,
    tableQuery,
    saved,
    drafts,
  });
  const [isDrafting, setIsDrafting] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // A draft that just landed, maybe far from where it was made, e.g. an
  // edited seed. It's scrolled into view.
  const [landedKey, setLandedKey] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const eventDrop = useEventDropTarget({
    onDrop: (event) => {
      if (takesEvents) {
        setLandedKey(addDraft(event));
      }
    },
  });
  const eventDropProps = takesEvents ? eventDrop.dropProps : {};

  const userItems: PaletteSegment[] = [...saved, ...drafted];
  const itemCount = userItems.length + seeds.length;
  // A long list, seeds included, gets a search box at the top.
  const isSearchable = itemCount >= SEARCH_THRESHOLD;
  const [searchText, setSearchText] = useState("");
  const search = isSearchable ? toSearchText(searchText.trim()) : "";
  const isShown = (segment: PaletteSegment) =>
    search === "" ||
    // A draft being edited stays, even if its name stops matching.
    segment.key === editingKey ||
    toSearchText(segment.name).includes(search);
  const shownUserItems = userItems.filter(isShown);
  const shownSeeds = seeds.filter(isShown);
  const canEdit = tableQuery !== undefined;
  // Who can create, edit or remove segments in Data Studio can do it from here.
  const canWriteSegments = useSelector((state) =>
    getUserCanWriteSegments(state, table.is_published),
  );
  const hasDataStudioAccess = useSelector(canAccessDataStudio);
  const [updateSegment] = useUpdateSegmentMutation();

  const findUserDraft = (key: string) => drafts.find((d) => d.id === key);
  // A seed is edited and saved like a draft, under its key.
  const findDraft = (key: string): SegmentDraft | undefined => {
    const seed = seeds.find((seed) => seed.key === key);
    return seed !== undefined
      ? { id: seed.key, name: seed.name, query: seed.query }
      : findUserDraft(key);
  };
  // The row being edited can go away under its editor, e.g. a seed hidden by a
  // draft dropped onto the panel. Its editor closes, and doesn't come back
  // if the row does.
  const isEditing = editingKey !== null && findDraft(editingKey) !== undefined;
  if (editingKey !== null && !isEditing) {
    setEditingKey(null);
  }

  const removeSegment = async (segment: Segment) => {
    const { error } = await updateSegment({
      id: segment.id,
      archived: true,
      revision_message: t`Removed from product analysis`,
    });
    sendToast(
      error
        ? { icon: "warning", message: t`Failed to remove segment` }
        : { icon: "check", message: t`Segment removed` },
    );
  };

  // Writers get the segment editor, its history and its Data Studio page.
  const getSavedActions = (segment: Segment): SavedSegmentActions => {
    if (!canWriteSegments) {
      return {};
    }
    return {
      editUrl: Urls.dataModelSegment(segment.id),
      revisionsUrl: Urls.dataModelSegmentRevisions(segment.id),
      dataStudioUrl: hasDataStudioAccess
        ? getSegmentDataStudioUrl(table, segment)
        : undefined,
      onRemove: () => removeSegment(segment),
    };
  };

  const discardDraft = (draft: SegmentDraft) => {
    removeDraft(draft.id);
    sendToast({
      message: t`Discarded the draft “${draft.name}”`,
      actionLabel: t`Undo`,
      action: () => restoreDraft(draft),
    });
  };

  const getRowProps = (segment: PaletteSegment): SegmentRowProps => {
    const draft =
      segment.status === "draft" ? findDraft(segment.key) : undefined;
    const userDraft =
      segment.status === "draft" && !segment.isSeed
        ? findUserDraft(segment.key)
        : undefined;
    return {
      segment,
      table,
      tableQuery,
      eventNameFieldId,
      editingDraft: segment.key === editingKey ? draft : undefined,
      savedActions:
        segment.status === "saved"
          ? getSavedActions(segment.segment)
          : undefined,
      hasLanded: segment.key === landedKey,
      onLanded: () => setLandedKey(null),
      onEdit: () => setEditingKey(segment.key),
      onCancelEdit: () => setEditingKey(null),
      onSubmitEdit: (event) => {
        // An edited seed becomes one of the user's drafts.
        if (userDraft !== undefined) {
          updateDraft(userDraft.id, event);
        } else {
          setLandedKey(addDraft(event));
        }
        setEditingKey(null);
      },
      onSave:
        canWriteSegments && draft !== undefined
          ? () => setModal({ draft })
          : undefined,
      // A seed has nothing to discard; it's there while its event name is.
      onDiscard:
        userDraft !== undefined ? () => discardDraft(userDraft) : undefined,
    };
  };

  if (isLoading || error !== undefined) {
    return <SectionLoader error={error} />;
  }

  return (
    <Stack className={S.section} gap="xs" px="md" py="xs" {...eventDropProps}>
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
      {shownUserItems.map((segment) => (
        <SegmentRow key={segment.key} {...getRowProps(segment)} />
      ))}
      {isDrafting && tableQuery !== undefined && (
        <Box ref={scrollIntoView}>
          <EventDefinitionEditor
            value={null}
            tableQuery={tableQuery}
            eventNameFieldId={eventNameFieldId}
            namePlaceholder={t`Name this draft`}
            withDrafts={false}
            onCancel={() => setIsDrafting(false)}
            onSubmit={(event) => {
              setLandedKey(addDraft(event));
              setIsDrafting(false);
            }}
          />
        </Box>
      )}
      {shownSeeds.map((segment) => (
        <SegmentRow key={segment.key} {...getRowProps(segment)} />
      ))}
      {itemCount === 0 && !isDrafting && (
        <Text px="xxs" c="text-secondary">
          {c("{0} is a table name")
            .t`No segments defined on ${table.display_name} yet.`}
        </Text>
      )}
      {itemCount > 0 &&
        shownUserItems.length === 0 &&
        shownSeeds.length === 0 && (
          <Text px="xxs" c="text-secondary">
            {t`No segments match “${searchText.trim()}”.`}
          </Text>
        )}
      {!isDrafting && !isEditing && (
        // Stays in view at the bottom of a list long enough to scroll.
        <Box className={S.footer}>
          <Button
            variant="light"
            leftSection={<Icon name="add" />}
            disabled={!canEdit}
            onClick={() => setIsDrafting(true)}
          >
            {t`Draft a segment`}
          </Button>
        </Box>
      )}
      {modal !== null && tableQuery !== undefined && (
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

type SegmentRowProps = {
  segment: PaletteSegment;
  table: Table;
  tableQuery: Lib.Query | undefined;
  eventNameFieldId: FieldId | undefined;
  /** The draft being edited in this row, if it is. */
  editingDraft: SegmentDraft | undefined;
  savedActions: SavedSegmentActions | undefined;
  /** Just added, so it's scrolled into view, once. */
  hasLanded: boolean;
  onLanded: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: (event: EventDefinition) => void;
  /** Omitted without permission to write segments. */
  onSave: (() => void) | undefined;
  /** Omitted for a seed. */
  onDiscard: (() => void) | undefined;
};

/** A segment in the list, or the editor while it's being edited. */
const SegmentRow = ({
  segment,
  table,
  tableQuery,
  eventNameFieldId,
  editingDraft,
  savedActions,
  hasLanded,
  onLanded,
  onEdit,
  onCancelEdit,
  onSubmitEdit,
  onSave,
  onDiscard,
}: SegmentRowProps) => {
  if (editingDraft !== undefined && tableQuery !== undefined) {
    return (
      <Box ref={scrollIntoView}>
        <EventDefinitionEditor
          value={editingDraft}
          tableQuery={tableQuery}
          eventNameFieldId={eventNameFieldId}
          namePlaceholder={t`Name this draft`}
          withDrafts={false}
          onCancel={onCancelEdit}
          onSubmit={onSubmitEdit}
        />
      </Box>
    );
  }
  return (
    <Box
      ref={
        hasLanded
          ? (node: HTMLElement | null) => {
              if (node !== null) {
                scrollIntoView(node);
                onLanded();
              }
            }
          : undefined
      }
      className={S.row}
      data-landed={hasLanded}
    >
      <PaletteSegmentItem
        segment={segment}
        definition={
          segment.status === "saved" ? (
            <SegmentDefinition segment={segment.segment} table={table} />
          ) : undefined
        }
        savedActions={savedActions}
        onEditDraft={onEdit}
        onSaveDraft={onSave}
        onDiscardDraft={onDiscard}
      />
    </Box>
  );
};

/** The segment's page in Data Studio: in the library for a published table. */
const getSegmentDataStudioUrl = (table: Table, segment: Segment): string =>
  table.is_published
    ? Urls.dataStudioPublishedTableSegment(table.id, segment.id)
    : Urls.dataStudioDataModelSegment({
        databaseId: table.db_id,
        schemaName: table.schema,
        tableId: table.id,
        segmentId: segment.id,
      });

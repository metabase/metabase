import { useCallback } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  useUpdateActionMutation,
  useUpdateCardMutation,
  useUpdateCollectionMutation,
  useUpdateDashboardMutation,
  useUpdateDocumentMutation,
  useUpdateSegmentMutation,
  useUpdateSnippetMutation,
  useUpdateSubscriptionMutation,
  useUpdateTimelineEventMutation,
  useUpdateTimelineMutation,
} from "metabase/api";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import type {
  Card,
  Collection,
  Dashboard,
  DashboardSubscription,
  Document,
  NativeQuerySnippet,
  Segment,
  Timeline,
  TimelineEvent,
  WritebackAction,
} from "metabase-types/api";

type Archivable<M extends string, T extends { id: unknown }> = {
  model: M;
  id: T["id"];
  archived?: boolean;
  can_write?: boolean;
};

export type ArchivableItem =
  | Archivable<"card", Card>
  | Archivable<"dataset", Card>
  | Archivable<"metric", Card>
  | Archivable<"dashboard", Dashboard>
  | Archivable<"collection", Collection>
  | Archivable<"snippet-collection", Collection>
  | Archivable<"document", Document>
  | Archivable<"action", WritebackAction>
  | Archivable<"segment", Segment>
  | Archivable<"timeline", Timeline>
  | Archivable<"timeline-event", TimelineEvent>
  | Archivable<"pulse", DashboardSubscription>
  | Archivable<"snippet", NativeQuerySnippet>;

export type ArchivableModel = ArchivableItem["model"];

type ArchivableLabels = {
  subject: () => string;
  archived: () => string;
  unarchived: () => string;
};

const LABELS = {
  card: {
    subject: () => t`question`,
    archived: () => t`trashed`,
    unarchived: () => t`restored`,
  },
  dataset: {
    subject: () => t`model`,
    archived: () => t`trashed`,
    unarchived: () => t`restored`,
  },
  metric: {
    subject: () => t`metric`,
    archived: () => t`trashed`,
    unarchived: () => t`restored`,
  },
  dashboard: {
    subject: () => t`dashboard`,
    archived: () => t`trashed`,
    unarchived: () => t`restored`,
  },
  collection: {
    subject: () => t`collection`,
    archived: () => t`trashed`,
    unarchived: () => t`restored`,
  },
  document: {
    subject: () => t`document`,
    archived: () => t`trashed`,
    unarchived: () => t`restored`,
  },
  action: {
    subject: () => t`action`,
    archived: () => t`archived`,
    unarchived: () => t`unarchived`,
  },
  segment: {
    subject: () => t`segment`,
    archived: () => t`archived`,
    unarchived: () => t`unarchived`,
  },
  timeline: {
    subject: () => t`timeline`,
    archived: () => t`archived`,
    unarchived: () => t`unarchived`,
  },
  "timeline-event": {
    subject: () => t`event`,
    archived: () => t`archived`,
    unarchived: () => t`unarchived`,
  },
  pulse: {
    subject: () => t`subscription`,
    archived: () => t`deleted`,
    unarchived: () => t`restored`,
  },
  snippet: {
    subject: () => t`snippet`,
    archived: () => t`archived`,
    unarchived: () => t`unarchived`,
  },
  "snippet-collection": {
    subject: () => t`folder`,
    archived: () => t`archived`,
    unarchived: () => t`unarchived`,
  },
} as const satisfies Record<ArchivableModel, ArchivableLabels>;

/**
 * Returns true if the given item can be archived and is writable.
 */
export function canArchive(item: ArchivableItem): boolean {
  return item.model in LABELS && item.can_write !== false;
}

export type ArchiveOptions = {
  notify?: boolean;
};

export function useSetArchive() {
  const dispatch = useDispatch();
  const [updateCard] = useUpdateCardMutation();
  const [updateDashboard] = useUpdateDashboardMutation();
  const [updateCollection] = useUpdateCollectionMutation();
  const [updateDocument] = useUpdateDocumentMutation();
  const [updateAction] = useUpdateActionMutation();
  const [updateSegment] = useUpdateSegmentMutation();
  const [updateTimeline] = useUpdateTimelineMutation();
  const [updateTimelineEvent] = useUpdateTimelineEventMutation();
  const [updateSubscription] = useUpdateSubscriptionMutation();
  const [updateSnippet] = useUpdateSnippetMutation();

  const setArchived = useCallback(
    (item: ArchivableItem, archived: boolean) =>
      match(item)
        .with(
          { model: "card" },
          { model: "dataset" },
          { model: "metric" },
          ({ id }) => updateCard({ id, archived }),
        )
        .with({ model: "dashboard" }, ({ id }) =>
          updateDashboard({ id, archived }),
        )
        .with(
          { model: "collection" },
          { model: "snippet-collection" },
          ({ id }) => updateCollection({ id, archived }),
        )
        .with({ model: "document" }, ({ id }) =>
          updateDocument({ id, archived }),
        )
        .with({ model: "action" }, ({ id }) => updateAction({ id, archived }))
        .with({ model: "segment" }, ({ id }) =>
          updateSegment({
            id,
            archived,
            revision_message: archived ? "(Archive)" : "(Unarchive)",
          }),
        )
        .with({ model: "timeline" }, ({ id }) =>
          updateTimeline({ id, archived, default: false }),
        )
        .with({ model: "timeline-event" }, ({ id }) =>
          updateTimelineEvent({ id, archived }),
        )
        .with({ model: "pulse" }, ({ id }) =>
          updateSubscription({ id, archived }),
        )
        .with({ model: "snippet" }, ({ id }) => updateSnippet({ id, archived }))
        .exhaustive(),
    [
      updateCard,
      updateDashboard,
      updateCollection,
      updateDocument,
      updateAction,
      updateSegment,
      updateTimeline,
      updateTimelineEvent,
      updateSubscription,
      updateSnippet,
    ],
  );

  return useCallback(
    async (
      item: ArchivableItem,
      archived = true,
      { notify = true }: ArchiveOptions = {},
    ) => {
      if (!canArchive(item)) {
        throw new Error(
          `useArchive: cannot archive item with model "${item.model}"`,
        );
      }

      await setArchived(item, archived);

      if (notify) {
        const labels = LABELS[item.model];

        dispatch(
          addUndo({
            subject: labels.subject(),
            verb: archived ? labels.archived() : labels.unarchived(),
            actions: [() => setArchived(item, !archived)],
          }),
        );
      }
    },
    [dispatch, setArchived],
  );
}

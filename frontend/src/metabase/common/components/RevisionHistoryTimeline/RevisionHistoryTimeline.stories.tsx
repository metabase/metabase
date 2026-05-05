import { action } from "@storybook/addon-actions";
import type { Meta } from "@storybook/react";

import type { RevisionOrModerationEvent } from "metabase/plugins";
import { createMockRevision } from "metabase-types/api/mocks";

import { RevisionHistoryTimeline } from "./RevisionHistoryTimeline";

const revert = action("revert");

export default {
  title: "Common/RevisionHistoryTimeline",
  component: RevisionHistoryTimeline,
  tags: ["autodocs"],
} satisfies Meta<typeof RevisionHistoryTimeline>;

// --- Card (Question) Timeline ---

const cardRevisionCreation = createMockRevision({
  id: 1,
  description: "created this.",
  timestamp: "2026-03-10T09:00:00.000Z",
  is_creation: true,
  user: {
    id: 2,
    first_name: "Bob",
    last_name: "Jones",
    common_name: "Bob Jones",
  },
});

const cardRevisionSingleEdit = createMockRevision({
  id: 2,
  description: "changed the display from table to bar.",
  timestamp: "2026-03-12T14:30:00.000Z",
  is_creation: false,
});

const cardRevisionMultipleChanges = createMockRevision({
  id: 3,
  description:
    "changed the display from bar to line, added a description and turned this into a model.",
  timestamp: "2026-03-14T10:15:00.000Z",
  has_multiple_changes: true,
  is_creation: false,
});

const cardRevisionReversion = createMockRevision({
  id: 4,
  description: "reverted to an earlier version.",
  timestamp: "2026-03-16T16:45:00.000Z",
  is_creation: false,
  is_reversion: true,
  user: {
    id: 2,
    first_name: "Bob",
    last_name: "Jones",
    common_name: "Bob Jones",
  },
});

const cardRevisionLatest = createMockRevision({
  id: 5,
  description: "added a filter.",
  timestamp: "2026-03-18T11:00:00.000Z",
  is_creation: false,
});

const cardModerationVerified: RevisionOrModerationEvent = {
  title: "Alice Smith verified this.",
  timestamp: "2026-03-15T08:00:00.000Z",
  icon: { name: "verified", color: "brand" },
};

const cardModerationRemoved: RevisionOrModerationEvent = {
  title: "Bob Jones removed verification.",
  timestamp: "2026-03-17T13:00:00.000Z",
  icon: { name: "close", color: "text-tertiary" },
};

const cardEvents: RevisionOrModerationEvent[] = [
  {
    title: "Alice Smith added a filter.",
    timestamp: cardRevisionLatest.timestamp,
    icon: "pencil",
    revision: cardRevisionLatest,
  },
  cardModerationRemoved,
  {
    title: "Bob Jones reverted to an earlier version.",
    timestamp: cardRevisionReversion.timestamp,
    icon: "pencil",
    revision: cardRevisionReversion,
  },
  cardModerationVerified,
  {
    title: "Alice Smith edited this.",
    description: cardRevisionMultipleChanges.description,
    timestamp: cardRevisionMultipleChanges.timestamp,
    icon: "pencil",
    revision: cardRevisionMultipleChanges,
  },
  {
    title: "Alice Smith changed the display from table to bar.",
    timestamp: cardRevisionSingleEdit.timestamp,
    icon: "pencil",
    revision: cardRevisionSingleEdit,
  },
  {
    title: "Bob Jones created this.",
    timestamp: cardRevisionCreation.timestamp,
    icon: "pencil",
    revision: cardRevisionCreation,
  },
];

export const CardTimeline = {
  args: {
    events: cardEvents,
    "data-testid": "card-timeline",
    canWrite: true,
    revert,
    entity: "card" as const,
  },
};

// --- Dashboard Timeline ---

const dashboardRevisionCreation = createMockRevision({
  id: 10,
  description: "created this.",
  timestamp: "2026-03-08T10:00:00.000Z",
  is_creation: true,
  user: {
    id: 3,
    first_name: "Carol",
    last_name: "Williams",
    common_name: "Carol Williams",
  },
});

const dashboardRevisionAddedFilter = createMockRevision({
  id: 11,
  description: "added a filter.",
  timestamp: "2026-03-10T15:00:00.000Z",
  is_creation: false,
  user: {
    id: 3,
    first_name: "Carol",
    last_name: "Williams",
    common_name: "Carol Williams",
  },
});

const dashboardRevisionMultipleChanges = createMockRevision({
  id: 12,
  description: "added a description, rearranged the cards and added a filter.",
  timestamp: "2026-03-13T09:30:00.000Z",
  is_creation: false,
  has_multiple_changes: true,
  user: {
    id: 4,
    first_name: "Dave",
    last_name: "Brown",
    common_name: "Dave Brown",
  },
});

const dashboardRevisionLatest = createMockRevision({
  id: 13,
  description: "moved a card.",
  timestamp: "2026-03-17T14:00:00.000Z",
  is_creation: false,
});

const dashboardModerationVerified: RevisionOrModerationEvent = {
  title: "Carol Williams verified this.",
  timestamp: "2026-03-14T11:00:00.000Z",
  icon: { name: "verified", color: "brand" },
};

const dashboardEvents: RevisionOrModerationEvent[] = [
  {
    title: "Alice Smith moved a card.",
    timestamp: dashboardRevisionLatest.timestamp,
    icon: "pencil",
    revision: dashboardRevisionLatest,
  },
  dashboardModerationVerified,
  {
    title: "Dave Brown edited this.",
    description: dashboardRevisionMultipleChanges.description,
    timestamp: dashboardRevisionMultipleChanges.timestamp,
    icon: "pencil",
    revision: dashboardRevisionMultipleChanges,
  },
  {
    title: "Carol Williams added a filter.",
    timestamp: dashboardRevisionAddedFilter.timestamp,
    icon: "pencil",
    revision: dashboardRevisionAddedFilter,
  },
  {
    title: "Carol Williams created this.",
    timestamp: dashboardRevisionCreation.timestamp,
    icon: "pencil",
    revision: dashboardRevisionCreation,
  },
];

export const DashboardTimeline = {
  args: {
    events: dashboardEvents,
    "data-testid": "dashboard-timeline",
    canWrite: true,
    revert,
    entity: "dashboard" as const,
  },
};

// --- Document Timeline (no moderation) ---

const documentRevisionCreation = createMockRevision({
  id: 20,
  description: "created this.",
  timestamp: "2026-03-05T08:00:00.000Z",
  is_creation: true,
  user: {
    id: 5,
    first_name: "Eve",
    last_name: "Garcia",
    common_name: "Eve Garcia",
  },
});

const documentRevisionEditedContent = createMockRevision({
  id: 21,
  description: "edited the content.",
  timestamp: "2026-03-09T12:00:00.000Z",
  is_creation: false,
  user: {
    id: 5,
    first_name: "Eve",
    last_name: "Garcia",
    common_name: "Eve Garcia",
  },
});

const documentRevisionMultipleChanges = createMockRevision({
  id: 22,
  description: "changed the title and edited the content.",
  timestamp: "2026-03-14T16:00:00.000Z",
  is_creation: false,
  has_multiple_changes: true,
});

const documentRevisionLatest = createMockRevision({
  id: 23,
  description: "changed the title.",
  timestamp: "2026-03-18T10:00:00.000Z",
  is_creation: false,
});

const documentEvents: RevisionOrModerationEvent[] = [
  {
    title: "Alice Smith changed the title.",
    timestamp: documentRevisionLatest.timestamp,
    icon: "pencil",
    revision: documentRevisionLatest,
  },
  {
    title: "Alice Smith edited this.",
    description: documentRevisionMultipleChanges.description,
    timestamp: documentRevisionMultipleChanges.timestamp,
    icon: "pencil",
    revision: documentRevisionMultipleChanges,
  },
  {
    title: "Eve Garcia edited the content.",
    timestamp: documentRevisionEditedContent.timestamp,
    icon: "pencil",
    revision: documentRevisionEditedContent,
  },
  {
    title: "Eve Garcia created this.",
    timestamp: documentRevisionCreation.timestamp,
    icon: "pencil",
    revision: documentRevisionCreation,
  },
];

export const DocumentTimeline = {
  args: {
    events: documentEvents,
    "data-testid": "document-timeline",
    canWrite: true,
    revert,
    entity: "document" as const,
  },
};

// --- Transform Timeline (no moderation) ---

const transformRevisionCreation = createMockRevision({
  id: 30,
  description: "created this.",
  timestamp: "2026-03-06T09:00:00.000Z",
  is_creation: true,
  user: {
    id: 6,
    first_name: "Frank",
    last_name: "Miller",
    common_name: "Frank Miller",
  },
});

const transformRevisionEditedDefinition = createMockRevision({
  id: 31,
  description: "edited the definition.",
  timestamp: "2026-03-11T11:00:00.000Z",
  is_creation: false,
  user: {
    id: 6,
    first_name: "Frank",
    last_name: "Miller",
    common_name: "Frank Miller",
  },
});

const transformRevisionMultipleChanges = createMockRevision({
  id: 32,
  description: "changed the name and edited the definition.",
  timestamp: "2026-03-15T14:30:00.000Z",
  is_creation: false,
  has_multiple_changes: true,
});

const transformRevisionLatest = createMockRevision({
  id: 33,
  description: "changed the name.",
  timestamp: "2026-03-19T08:00:00.000Z",
  is_creation: false,
});

const transformEvents: RevisionOrModerationEvent[] = [
  {
    title: "Alice Smith changed the name.",
    timestamp: transformRevisionLatest.timestamp,
    icon: "pencil",
    revision: transformRevisionLatest,
  },
  {
    title: "Alice Smith edited this.",
    description: transformRevisionMultipleChanges.description,
    timestamp: transformRevisionMultipleChanges.timestamp,
    icon: "pencil",
    revision: transformRevisionMultipleChanges,
  },
  {
    title: "Frank Miller edited the definition.",
    timestamp: transformRevisionEditedDefinition.timestamp,
    icon: "pencil",
    revision: transformRevisionEditedDefinition,
  },
  {
    title: "Frank Miller created this.",
    timestamp: transformRevisionCreation.timestamp,
    icon: "pencil",
    revision: transformRevisionCreation,
  },
];

export const TransformTimeline = {
  args: {
    events: transformEvents,
    "data-testid": "transform-timeline",
    canWrite: true,
    revert,
    entity: "transform" as const,
  },
};

// --- Read-Only (no revert buttons) ---

export const ReadOnly = {
  args: {
    events: cardEvents,
    "data-testid": "readonly-timeline",
    canWrite: false,
    revert,
    entity: "card" as const,
  },
};

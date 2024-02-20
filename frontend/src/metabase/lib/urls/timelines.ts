import type { Collection, Timeline, TimelineEvent } from "metabase-types/api";

import { collection as getCollectionUrl } from "./collections";

export function timelinesInCollection(collection?: Collection) {
  const collectionUrl = getCollectionUrl(collection);
  return `${collectionUrl}/timelines`;
}

export function timelinesArchiveInCollection(collection?: Collection) {
  return `${timelinesInCollection(collection)}/archive`;
}

export function timelineInCollection(timeline: Timeline) {
  return `${timelinesInCollection(timeline.collection)}/${timeline.id}`;
}

export function newTimelineInCollection(collection?: Collection) {
  return `${timelinesInCollection(collection)}/new`;
}

export function editTimelineInCollection(timeline: Timeline) {
  return `${timelineInCollection(timeline)}/edit`;
}

export function moveTimelineInCollection(timeline: Timeline) {
  return `${timelineInCollection(timeline)}/move`;
}

export function timelineArchiveInCollection(timeline: Timeline) {
  return `${timelineInCollection(timeline)}/archive`;
}

export function deleteTimelineInCollection(timeline: Timeline) {
  return `${timelineInCollection(timeline)}/delete`;
}

export function newEventInCollection(timeline: Timeline) {
  return `${timelineInCollection(timeline)}/events/new`;
}

export function newEventAndTimelineInCollection(collection?: Collection) {
  return `${timelinesInCollection(collection)}/new/events/new`;
}

export function editEventInCollection(
  event: TimelineEvent,
  timeline: Timeline,
) {
  const timelineUrl = timelineInCollection(timeline);
  return `${timelineUrl}/events/${event.id}/edit`;
}

export function moveEventInCollection(
  event: TimelineEvent,
  timeline: Timeline,
) {
  const timelineUrl = timelineInCollection(timeline);
  return `${timelineUrl}/events/${event.id}/move`;
}

export function deleteEventInCollection(
  event: TimelineEvent,
  timeline: Timeline,
) {
  const timelineUrl = timelineInCollection(timeline);
  return `${timelineUrl}/events/${event.id}/delete`;
}

export type TimelineMode =
  | "timeline-list"
  | "timeline-view"
  | "timeline-new"
  | "timeline-edit"
  | "timeline-event-new"
  | "timeline-event-edit";

export interface TimelineState {
  mode: TimelineMode;
  timelineId?: number;
  timelineEventId?: number;
}

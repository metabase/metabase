export type TimelineMode =
  | "timeline-view"
  | "timeline-list"
  | "timeline-new"
  | "timeline-edit"
  | "timeline-event-new"
  | "timeline-event-new-default"
  | "timeline-event-edit";

export interface TimelineState {
  mode: TimelineMode;
  timelineId?: number;
  timelineEventId?: number;
}

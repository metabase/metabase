/**
 * Timeline helpers for the timelines-question spec port. Ports of:
 * - e2e/support/helpers/api/createTimeline.ts
 * - e2e/support/helpers/api/createTimelineEvent.ts
 * - e2e/support/helpers/api/createTimelineWithEvents.ts
 * - e2e/support/helpers/e2e-visual-tests-helpers.js (timelineEventChip)
 * plus the spec-local timeline helpers (timelineEventCard,
 * toggleEventVisibility, timelineEventVisibility,
 * waitForTimelinesAfterCreatingAnEvent).
 *
 * New module per the parallel-agent rule; fold into an organization/charts
 * module at consolidation if it grows.
 */
import type { FrameLocator, Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";

/** Any locator root that exposes `.locator()`. */
type Scope = Page | FrameLocator | Locator;

type TimelineInput = {
  name?: string;
  icon?: string;
  default?: boolean;
  archived?: boolean;
  collection_id?: number | null;
  description?: string;
};

type EventInput = {
  name?: string;
  icon?: string;
  timestamp?: string;
  time_matters?: boolean;
  timezone?: string;
  archived?: boolean;
  description?: string;
  timeline_id?: number;
};

/** Port of H.createTimeline (api/createTimeline.ts): POST /api/timeline with
 * the same defaults. Runs as the currently signed-in api user. */
export async function createTimeline(
  api: MetabaseApi,
  {
    name = "Timeline",
    icon = "star",
    default: isDefault = false,
    archived = false,
    ...params
  }: TimelineInput = {},
): Promise<{ id: number }> {
  const response = await api.post("/api/timeline", {
    ...params,
    name,
    icon,
    default: isDefault,
    archived,
  });
  return response.json();
}

/** Port of H.createTimelineEvent (api/createTimelineEvent.ts): POST
 * /api/timeline-event with the same defaults. */
export async function createTimelineEvent(
  api: MetabaseApi,
  {
    name = "Event",
    icon = "star",
    timestamp = "2020-01-01T00:00:00Z",
    time_matters = false,
    timezone = "UTC",
    archived = false,
    ...params
  }: EventInput,
): Promise<{ id: number }> {
  const response = await api.post("/api/timeline-event", {
    ...params,
    name,
    icon,
    timestamp,
    time_matters,
    timezone,
    archived,
  });
  return response.json();
}

/** Port of H.createTimelineWithEvents: create the timeline, then each event
 * attached to it. */
export async function createTimelineWithEvents(
  api: MetabaseApi,
  { timeline, events }: { timeline?: TimelineInput; events: EventInput[] },
): Promise<{ timeline: { id: number }; events: { id: number }[] }> {
  const created = await createTimeline(api, timeline);
  const createdEvents = [];
  for (const event of events) {
    createdEvents.push(
      await createTimelineEvent(api, { ...event, timeline_id: created.id }),
    );
  }
  return { timeline: created, events: createdEvents };
}

/** Port of H.timelineEventChip(label): the chart's timeline-event chip whose
 * aria-label matches. */
export function timelineEventChip(scope: Scope, label: string): Locator {
  return scope.locator(
    `[data-testid="timeline-event-chip"][aria-label="${label}"]`,
  );
}

/** Port of the spec-local timelineEventCard: the sidebar card enclosing an
 * event's name. `findByText(name).closest("[aria-label='Timeline event card']")`. */
export function timelineEventCard(scope: Scope, eventName: string): Locator {
  return scope
    .getByText(eventName, { exact: true })
    .locator("xpath=ancestor-or-self::*[@aria-label='Timeline event card']");
}

/** Port of the spec-local timelineEventVisibility: the event card's checkbox. */
export function timelineEventVisibility(scope: Scope, eventName: string): Locator {
  return timelineEventCard(scope, eventName).getByRole("checkbox");
}

/** Port of the spec-local toggleEventVisibility: click the event's visibility
 * checkbox. Returns the checkbox so callers can assert its state (the Cypress
 * original chains `.should("[not.]be.checked")` off the returned subject). */
export async function toggleEventVisibility(
  scope: Scope,
  eventName: string,
): Promise<Locator> {
  const checkbox = timelineEventVisibility(scope, eventName);
  await checkbox.click();
  return checkbox;
}

/** Port of the spec-local waitForTimelinesAfterCreatingAnEvent: after
 * creating an event the timelines refetch, surfaced by the card's byline. */
export function waitForTimelinesAfterCreatingAnEvent(
  scope: Scope,
  eventName: string,
): Locator {
  return timelineEventCard(scope, eventName).getByText(
    /^Bobby Tables added this on/,
  );
}

/** The sidebar's timeline card header enclosing a timeline's name.
 * `findByText(name).closest("[aria-label='Timeline card header']")`. */
export function timelineCardHeader(scope: Scope, name: string): Locator {
  return scope
    .getByText(name, { exact: true })
    .locator("xpath=ancestor-or-self::*[@aria-label='Timeline card header']");
}

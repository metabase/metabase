import { lazyModalComponent } from "metabase/common/components/ModalRoute";
import type { RouteObject } from "metabase/router";
import { NO_ANIMATION_MODAL_PROPS } from "metabase/ui";

/**
 * The timeline modals, in one chunk. They open over a collection, and every one
 * of them is reached from this list alone, so one name keeps the whole set to a
 * single request.
 */
const options = { modalProps: NO_ANIMATION_MODAL_PROPS };

const timelineIndexModal = () =>
  import(
    /* webpackChunkName: "timelines" */ "./containers/TimelineIndexModal"
  ).then(({ default: TimelineIndexModal }) => TimelineIndexModal);

const newTimelineModal = () =>
  import(
    /* webpackChunkName: "timelines" */ "./containers/NewTimelineModal"
  ).then(({ default: NewTimelineModal }) => NewTimelineModal);

const timelineListArchiveModal = () =>
  import(
    /* webpackChunkName: "timelines" */ "./containers/TimelineListArchiveModal"
  ).then(({ default: TimelineListArchiveModal }) => TimelineListArchiveModal);

const timelineDetailsModal = () =>
  import(
    /* webpackChunkName: "timelines" */ "./containers/TimelineDetailsModal"
  ).then(({ default: TimelineDetailsModal }) => TimelineDetailsModal);

const editTimelineModal = () =>
  import(
    /* webpackChunkName: "timelines" */ "./containers/EditTimelineModal"
  ).then(({ default: EditTimelineModal }) => EditTimelineModal);

const moveTimelineModal = () =>
  import(
    /* webpackChunkName: "timelines" */ "./containers/MoveTimelineModal"
  ).then(({ default: MoveTimelineModal }) => MoveTimelineModal);

const timelineArchiveModal = () =>
  import(
    /* webpackChunkName: "timelines" */ "./containers/TimelineArchiveModal"
  ).then(({ default: TimelineArchiveModal }) => TimelineArchiveModal);

const deleteTimelineModal = () =>
  import(
    /* webpackChunkName: "timelines" */ "./containers/DeleteTimelineModal"
  ).then(({ default: DeleteTimelineModal }) => DeleteTimelineModal);

const newEventWithTimelineModal = () =>
  import(
    /* webpackChunkName: "timelines" */ "./containers/NewEventWithTimelineModal"
  ).then(({ default: NewEventWithTimelineModal }) => NewEventWithTimelineModal);

const newEventModal = () =>
  import(/* webpackChunkName: "timelines" */ "./containers/NewEventModal").then(
    ({ default: NewEventModal }) => NewEventModal,
  );

const editEventModal = () =>
  import(
    /* webpackChunkName: "timelines" */ "./containers/EditEventModal"
  ).then(({ default: EditEventModal }) => EditEventModal);

const moveEventModal = () =>
  import(
    /* webpackChunkName: "timelines" */ "./containers/MoveEventModal"
  ).then(({ default: MoveEventModal }) => MoveEventModal);

const deleteEventModal = () =>
  import(
    /* webpackChunkName: "timelines" */ "./containers/DeleteEventModal"
  ).then(({ default: DeleteEventModal }) => DeleteEventModal);

export function getCollectionTimelineRoutes(): RouteObject[] {
  return [
    {
      path: "timelines",
      children: [
        {
          index: true,
          lazy: lazyModalComponent(timelineIndexModal, options),
        },
        {
          path: "new",
          lazy: lazyModalComponent(newTimelineModal, options),
        },
        {
          path: "new/events/new",
          lazy: lazyModalComponent(newEventWithTimelineModal, options),
        },
        {
          path: "archive",
          lazy: lazyModalComponent(timelineListArchiveModal, options),
        },
        {
          path: ":timelineId",
          children: [
            {
              index: true,
              lazy: lazyModalComponent(timelineDetailsModal, {
                ...options,
                closeTo: "../..",
              }),
            },
            {
              path: "edit",
              lazy: lazyModalComponent(editTimelineModal, options),
            },
            {
              path: "move",
              lazy: lazyModalComponent(moveTimelineModal, {
                ...options,
                noWrap: true,
              }),
            },
            {
              path: "archive",
              lazy: lazyModalComponent(timelineArchiveModal, options),
            },
            {
              path: "delete",
              // Opened from `timelines/archive`
              lazy: lazyModalComponent(deleteTimelineModal, {
                ...options,
                closeTo: "../../archive",
              }),
            },
            {
              path: "events/new",
              lazy: lazyModalComponent(newEventModal, options),
            },
            {
              path: "events/:timelineEventId/edit",
              lazy: lazyModalComponent(editEventModal, options),
            },
            {
              path: "events/:timelineEventId/move",
              lazy: lazyModalComponent(moveEventModal, options),
            },
            {
              path: "events/:timelineEventId/delete",
              // Opened from `:timelineId/archive`
              lazy: lazyModalComponent(deleteEventModal, {
                ...options,
                closeTo: "../archive",
              }),
            },
          ],
        },
      ],
    },
  ];
}

import { lazyModalRoute } from "metabase/common/components/ModalRoute";
import type { RouteObject } from "metabase/router";
import { NO_ANIMATION_MODAL_PROPS } from "metabase/ui";

/**
 * The timeline modals, in one chunk. They open over a collection, and every one
 * of them is reached from this list alone, so one name keeps the whole set to a
 * single request.
 *
 * These are route objects rather than JSX: `lazyModalRoute` defers the modal
 * itself while the path stays static, which is what matching needs.
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
    lazyModalRoute("timelines", timelineIndexModal, options),
    lazyModalRoute("timelines/new", newTimelineModal, options),
    lazyModalRoute("timelines/archive", timelineListArchiveModal, options),
    lazyModalRoute("timelines/:timelineId", timelineDetailsModal, options),
    lazyModalRoute("timelines/:timelineId/edit", editTimelineModal, options),
    lazyModalRoute("timelines/:timelineId/move", moveTimelineModal, {
      ...options,
      noWrap: true,
    }),
    lazyModalRoute(
      "timelines/:timelineId/archive",
      timelineArchiveModal,
      options,
    ),
    lazyModalRoute(
      "timelines/:timelineId/delete",
      deleteTimelineModal,
      options,
    ),
    lazyModalRoute(
      "timelines/new/events/new",
      newEventWithTimelineModal,
      options,
    ),
    lazyModalRoute("timelines/:timelineId/events/new", newEventModal, options),
    lazyModalRoute(
      "timelines/:timelineId/events/:timelineEventId/edit",
      editEventModal,
      options,
    ),
    lazyModalRoute(
      "timelines/:timelineId/events/:timelineEventId/move",
      moveEventModal,
      options,
    ),
    lazyModalRoute(
      "timelines/:timelineId/events/:timelineEventId/delete",
      deleteEventModal,
      options,
    ),
  ];
}

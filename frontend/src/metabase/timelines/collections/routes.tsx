import type { Location } from "history";
import type React from "react";
import { Fragment } from "react";
import type { RouteObject } from "react-router-dom";

import { ModalRoute } from "metabase/hoc/ModalRoute";
import {
  createModalRoute,
  useCompatLocation,
  useCompatParams,
} from "metabase/routing/compat";

import DeleteEventModal from "./containers/DeleteEventModal";
import DeleteTimelineModal from "./containers/DeleteTimelineModal";
import EditEventModal from "./containers/EditEventModal";
import EditTimelineModal from "./containers/EditTimelineModal";
import MoveEventModal from "./containers/MoveEventModal";
import MoveTimelineModal from "./containers/MoveTimelineModal";
import NewEventModal from "./containers/NewEventModal";
import NewEventWithTimelineModal from "./containers/NewEventWithTimelineModal";
import NewTimelineModal from "./containers/NewTimelineModal";
import TimelineArchiveModal from "./containers/TimelineArchiveModal";
import TimelineDetailsModal from "./containers/TimelineDetailsModal";
import TimelineIndexModal from "./containers/TimelineIndexModal";
import TimelineListArchiveModal from "./containers/TimelineListArchiveModal";
import type { ModalParams } from "./types";

const withTimelineModalRouteProps = (Component: React.ComponentType<any>) => {
  return function TimelineModalRoute({ onClose }: { onClose: () => void }) {
    const params = useCompatParams<Record<string, string | undefined>>();
    const location = useCompatLocation();

    return (
      <Component
        onClose={onClose}
        params={params as unknown as ModalParams}
        location={location as unknown as Location}
      />
    );
  };
};

const getRoutes = () => {
  return (
    <Fragment>
      <ModalRoute
        {...{
          path: "timelines",
          modal: TimelineIndexModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/new",
          modal: NewTimelineModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/archive",
          modal: TimelineListArchiveModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId",
          modal: TimelineDetailsModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/edit",
          modal: EditTimelineModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/move",
          modal: MoveTimelineModal,
          modalProps: { enableTransition: false },
          noWrap: true,
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/archive",
          modal: TimelineArchiveModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/delete",
          modal: DeleteTimelineModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/new/events/new",
          modal: NewEventWithTimelineModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/events/new",
          modal: NewEventModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/events/:timelineEventId/edit",
          modal: EditEventModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/events/:timelineEventId/move",
          modal: MoveEventModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/events/:timelineEventId/delete",
          modal: DeleteEventModal,
          modalProps: { enableTransition: false },
        }}
      />
    </Fragment>
  );
};

export const getRouteObjects = (): RouteObject[] => [
  createModalRoute(
    "timelines",
    withTimelineModalRouteProps(TimelineIndexModal),
    {
      modalProps: { enableTransition: false },
    },
  ),
  createModalRoute(
    "timelines/new",
    withTimelineModalRouteProps(NewTimelineModal),
    {
      modalProps: { enableTransition: false },
    },
  ),
  createModalRoute(
    "timelines/archive",
    withTimelineModalRouteProps(TimelineListArchiveModal),
    {
      modalProps: { enableTransition: false },
    },
  ),
  createModalRoute(
    "timelines/:timelineId",
    withTimelineModalRouteProps(TimelineDetailsModal),
    {
      modalProps: { enableTransition: false },
    },
  ),
  createModalRoute(
    "timelines/:timelineId/edit",
    withTimelineModalRouteProps(EditTimelineModal),
    {
      modalProps: { enableTransition: false },
    },
  ),
  createModalRoute(
    "timelines/:timelineId/move",
    withTimelineModalRouteProps(MoveTimelineModal),
    {
      modalProps: { enableTransition: false },
      noWrap: true,
    },
  ),
  createModalRoute(
    "timelines/:timelineId/archive",
    withTimelineModalRouteProps(TimelineArchiveModal),
    {
      modalProps: { enableTransition: false },
    },
  ),
  createModalRoute(
    "timelines/:timelineId/delete",
    withTimelineModalRouteProps(DeleteTimelineModal),
    {
      modalProps: { enableTransition: false },
    },
  ),
  createModalRoute(
    "timelines/new/events/new",
    withTimelineModalRouteProps(NewEventWithTimelineModal),
    {
      modalProps: { enableTransition: false },
    },
  ),
  createModalRoute(
    "timelines/:timelineId/events/new",
    withTimelineModalRouteProps(NewEventModal),
    {
      modalProps: { enableTransition: false },
    },
  ),
  createModalRoute(
    "timelines/:timelineId/events/:timelineEventId/edit",
    withTimelineModalRouteProps(EditEventModal),
    {
      modalProps: { enableTransition: false },
    },
  ),
  createModalRoute(
    "timelines/:timelineId/events/:timelineEventId/move",
    withTimelineModalRouteProps(MoveEventModal),
    {
      modalProps: { enableTransition: false },
    },
  ),
  createModalRoute(
    "timelines/:timelineId/events/:timelineEventId/delete",
    withTimelineModalRouteProps(DeleteEventModal),
    {
      modalProps: { enableTransition: false },
    },
  ),
];

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default getRoutes;

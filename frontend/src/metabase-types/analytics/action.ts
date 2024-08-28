import type {
  WritebackActionId,
  WritebackActionType,
} from "metabase-types/api";

export type ActionCreatedEvent = {
  event: "action_created";
  type: WritebackActionType;
  action_id: WritebackActionId;
};

export type ActionUpdatedEvent = {
  event: "action_updated";
  type: WritebackActionType;
  action_id: WritebackActionId;
};

export type ActionDeletedEvent = {
  event: "action_deleted";
  type: WritebackActionType;
  action_id: WritebackActionId;
};

export type ActionExecutedEvent = {
  event: "action_executed";
  type: WritebackActionType;
  action_id: WritebackActionId;
};

export type ActionEvent =
  | ActionCreatedEvent
  | ActionUpdatedEvent
  | ActionDeletedEvent
  | ActionExecutedEvent;

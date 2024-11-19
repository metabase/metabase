type ActionEventSchema = {
  event: string;
  type: string;
  action_id: number;
  num_parameters?: number | null;
  context?: string | null;
};

type ValidateEvent<
  T extends ActionEventSchema &
    Record<Exclude<keyof T, keyof ActionEventSchema>, never>,
> = T;

type ActionType = "http" | "query" | "implicit";

export type ActionCreatedEvent = ValidateEvent<{
  event: "action_created";
  type: ActionType;
  action_id: number;
}>;

export type ActionUpdatedEvent = ValidateEvent<{
  event: "action_updated";
  type: ActionType;
  action_id: number;
}>;

export type ActionDeletedEvent = ValidateEvent<{
  event: "action_deleted";
  type: ActionType;
  action_id: number;
}>;

export type ActionExecutedEvent = ValidateEvent<{
  event: "action_executed";
  type: ActionType;
  action_id: number;
}>;

export type ActionEvent =
  | ActionCreatedEvent
  | ActionUpdatedEvent
  | ActionDeletedEvent
  | ActionExecutedEvent;

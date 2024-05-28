export interface SetupCheckListItem {
  name: string;
  tasks: SetupCheckListTask[];
}

export interface SetupCheckListTask {
  title: string;
  group: string;
  description: string;
  link: string;
  completed: boolean;
  triggered: boolean;
  is_next_step: boolean;
}

export type UsageReason =
  | "self-service-analytics"
  | "embedding"
  | "both"
  | "not-sure";

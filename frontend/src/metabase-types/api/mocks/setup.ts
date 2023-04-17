import { SetupCheckListItem, SetupCheckListTask } from "metabase-types/api";

export const createMockSetupCheckListItem = (
  opts?: Partial<SetupCheckListItem>,
): SetupCheckListItem => ({
  name: "Setup",
  tasks: [],
  ...opts,
});

export const createMockSetupCheckListTask = (
  opts?: Partial<SetupCheckListTask>,
): SetupCheckListTask => ({
  title: "Setup",
  group: "Setup",
  description: "Setup",
  link: "/",
  completed: false,
  triggered: true,
  is_next_step: false,
  ...opts,
});

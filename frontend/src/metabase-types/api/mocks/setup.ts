import { SetupCheckListItem, SetupCheckListTask } from "metabase-types/api";

export const createMockSetupCheckListItem = (
  opts?: Partial<SetupCheckListItem>,
): SetupCheckListItem => ({
  name: "Get connected",
  tasks: [],
  ...opts,
});

export const createMockSetupCheckListTask = (
  opts?: Partial<SetupCheckListTask>,
): SetupCheckListTask => ({
  title: "Add a database",
  group: "Get connected",
  description: "Connect to your data so your whole team can start to explore.",
  link: "/admin/databases/create",
  completed: false,
  triggered: true,
  is_next_step: false,
  ...opts,
});

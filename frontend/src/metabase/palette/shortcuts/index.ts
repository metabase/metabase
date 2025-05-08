import { adminShortcuts } from "./admin";
import { collectionShortcuts } from "./collection";
import { dashboardShortcuts } from "./dashboard";
import { globalShortcuts } from "./global";
import { questionShortcuts } from "./question";

export const shortcuts = {
  ...globalShortcuts,
  ...dashboardShortcuts,
  ...collectionShortcuts,
  ...questionShortcuts,
  ...adminShortcuts,
};

export type KeyboardShortcutId = keyof typeof shortcuts;

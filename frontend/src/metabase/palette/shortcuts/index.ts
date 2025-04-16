import { collectionShortcuts } from "./collection";
import { dashboardShortcuts } from "./dashboard";
import { globalShortcuts } from "./global";
import { questionShortcuts } from "./question";

export const shortcuts = {
  ...globalShortcuts,
  ...dashboardShortcuts,
  ...collectionShortcuts,
  ...questionShortcuts,
};

export type ShortcutId = keyof typeof shortcuts;

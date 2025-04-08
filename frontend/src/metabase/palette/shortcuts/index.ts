import { dashboardShortcuts } from "./dashboard";
import { globalShortcuts } from "./global";
// import { questionShortcuts } from "./question";

export const shortcuts = {
  ...globalShortcuts,
  ...dashboardShortcuts,
  // ...questionShortcuts,
};

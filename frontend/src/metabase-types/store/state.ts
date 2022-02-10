import { AdminState } from "./admin";
import { SettingsState } from "./settings";
import { TimelineState } from "./timeline";

export interface State {
  admin: AdminState;
  settings: SettingsState;
  timeline: TimelineState;
}

import type { State } from "metabase-types/store";

export const getAdminSettingDefinitions = (state: State) =>
  state.admin.settings.settings;

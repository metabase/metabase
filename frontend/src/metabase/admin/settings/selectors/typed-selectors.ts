import type { State } from "metabase-types/store";

export const getAdminSettingDefinitions = (state: State) =>
  state.admin.settings.settings;

export const getAdminSettingWarnings = (state: State) =>
  state.admin.settings.warnings;

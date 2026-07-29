// The module's public interface.
//
// Everything outside `metabase/settings` imports from here; files inside the
// module import each other relatively. Exports are listed explicitly rather
// than `export *` so that widening the public surface is a deliberate edit and
// shows up in review — the module's job is to be the one owner of settings
// access, which only holds if what it exposes stays deliberate.
//
// Names absent here are module-private on purpose: `UpdateSettingArg`,
// `useGetSettingQuery`, `useUpdateUserSettingMutation`, and the unaliased
// `useGetSessionPropertiesQuery`/`useLazyGetSessionPropertiesQuery` (callers use
// the `...SettingsQuery` aliases). Add them if a real consumer needs them.

export {
  refetchSiteSettings,
  sessionPropertiesPath,
  settingsApi,
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
  useGetVersionInfoQuery,
  useLazyGetSettingsQuery,
  useUpdateSettingMutation,
  useUpdateSettingsMutation,
} from "./api";
export {
  getSetting,
  getSettings,
  getSettingsLoading,
  getTokenFeature,
} from "./selectors";
export { useAdminSetting, useAdminSettings } from "./use-admin-setting";
export { useSetting, useUserSetting } from "./use-setting";

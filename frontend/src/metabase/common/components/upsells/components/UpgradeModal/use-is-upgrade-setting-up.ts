import {
  WAITING_REFRESH_INTERVAL,
  useGetSettingsQuery,
  useTokenRefreshUntil,
} from "metabase/settings";

/**
 * Polls the token status while `skip` is false and returns whether the
 * upgrade is still being set up. Returns `true` while skipped or while
 * settings are loading.
 */
export function useIsUpgradeSettingUp({ skip }: { skip: boolean }) {
  useTokenRefreshUntil("no-upsell", {
    intervalMs: WAITING_REFRESH_INTERVAL,
    skip,
  });

  const { data: settings } = useGetSettingsQuery(undefined, { skip });
  const tokenFeatures = settings?.["token-status"]?.features ?? [];
  return !tokenFeatures.includes("no-upsell");
}

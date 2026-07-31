import _ from "underscore";

import type {
  EnterpriseSettingKey,
  EnterpriseSettingValue,
  EnterpriseSettings,
  SettingDefinition,
  SettingDefinitionMap,
} from "metabase-types/api";

import { Api } from "./api";
import { sessionApi } from "./session";
import { invalidateTags, listTag, tag } from "./tags";

export type UpdateSettingArg = {
  key: EnterpriseSettingKey;
  value: EnterpriseSettingValue<EnterpriseSettingKey>;
};

const putSettingQuery = ({ key, value }: UpdateSettingArg) => ({
  method: "PUT" as const,
  url: `/api/setting/${encodeURIComponent(key)}`,
  body: { value },
});

export const settingsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    // admin-only endpoint that returns all settings with lots of extra metadata
    getAdminSettingsDetails: builder.query<SettingDefinitionMap, void>({
      query: () => ({
        method: "GET",
        url: "/api/setting",
      }),
      transformResponse: (response: SettingDefinition[]) =>
        // Unjustified type cast. FIXME
        _.indexBy(response, "key") as SettingDefinitionMap,
      providesTags: ["session-properties"],
    }),
    getSetting: builder.query<
      EnterpriseSettingValue,
      Exclude<EnterpriseSettingKey, "version-info">
    >({
      query: (name) => ({
        method: "GET",
        url: `/api/setting/${encodeURIComponent(name)}`,
      }),
      providesTags: ["session-properties"],
    }),
    getVersionInfo: builder.query<EnterpriseSettings["version-info"], void>({
      query: () => ({
        method: "GET",
        url: "/api/setting/version-info",
      }),
      // don't provide a tag, this should never be refetched
    }),
    updateSetting: builder.mutation<void, UpdateSettingArg>({
      query: putSettingQuery,
      invalidatesTags: (_, error, { key }) => {
        return invalidateTags(error, [
          tag("session-properties"),
          ...(key === "uploads-settings" ? [listTag("database")] : []),
          ...(key === "llm-anthropic-api-key" ? [listTag("llm-models")] : []),
          ...(key === "mfa-enforcement" ? [tag("mfa-status")] : []),

          // Enabling tenants creates the "all-external-users" permission group
          ...(key === "use-tenants" ? [listTag("permissions-group")] : []),
        ]);
      },
    }),
    updateSettings: builder.mutation<void, Partial<EnterpriseSettings>>({
      query: (settings) => ({
        method: "PUT",
        url: `/api/setting`,
        body: settings,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          tag("session-properties"),
          listTag("embedding-hub-checklist"),
        ]),
    }),
    // This mutation is the cheap write path for user preferences, such as
    // sidebar collapse state, dismissed prompts, and remembered formats.
    // These settings are written during ordinary UI interactions, sometimes
    // on every click, so they must update the UI instantly and must not
    // trigger refetches. To achieve that, this mutation patches the new value
    // into the session-properties cache before the PUT resolves, and it
    // deliberately does not invalidate the session-properties tag.
    // Invalidating would refetch the full settings payload on every toggle,
    // and it would do so twice because the admin setting-details query
    // provides the same tag. The old settings slice gave this kind of write
    // for free by assigning the value into local state, and this mutation is
    // the cache-era replacement.
    //
    // Use `updateSetting` for admin configuration instead. It is pessimistic,
    // meaning it waits for the server and then invalidates and refetches, so
    // the UI never shows state the server has not accepted.
    updateUserSetting: builder.mutation<void, UpdateSettingArg>({
      query: putSettingQuery,
      onQueryStarted: async ({ key, value }, { dispatch, queryFulfilled }) => {
        const patch = dispatch(
          sessionApi.util.updateQueryData(
            "getSessionProperties",
            undefined,
            (draft) => {
              // Unjustified type cast. FIXME
              (draft as Record<string, unknown>)[key] = value;
            },
          ),
        );
        try {
          await queryFulfilled;
          // `patch.patches.length === 0` means the settings cache was still
          // empty when we tried to patch it, because the boot-time settings
          // fetch has not returned yet. That leaves us with two problems:
          //
          // 1. Our optimistic patch did nothing, because `updateQueryData`
          //    cannot patch a cache entry that does not exist.
          // 2. The response of that in-flight boot fetch will not contain this
          //    write either, because the server produced it before our PUT.
          //
          // So once the boot fetch lands, the cache would hold pre-PUT values
          // and the user's change would be lost. Invalidate the tag to fetch
          // the settings again, now including the write. This is the only case
          // where this mutation causes a refetch.
          if (patch.patches.length === 0) {
            dispatch(
              sessionApi.util.invalidateTags([tag("session-properties")]),
            );
          }
        } catch {
          // The PUT failed, so the server never accepted the optimistically
          // patched value. Roll the cache back to the server's truth so that
          // the UI reverts instead of continuing to show unsaved state.
          patch.undo();
        }
      },
    }),
  }),
});

export const {
  useGetSettingQuery,
  useGetVersionInfoQuery,
  useGetAdminSettingsDetailsQuery,
  useUpdateSettingMutation,
  useUpdateSettingsMutation,
  useUpdateUserSettingMutation,
} = settingsApi;

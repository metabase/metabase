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

type UpdateSettingArg = {
  key: EnterpriseSettingKey;
  value: EnterpriseSettingValue<EnterpriseSettingKey>;
};

const putSettingQuery = ({ key, value }: UpdateSettingArg) => ({
  method: "PUT",
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
    // Optimistic single-value update: patch the session-properties cache
    // immediately and roll back if the PUT fails, *without* invalidating the
    // session-properties tag — so we don't refetch the whole settings payload.
    // Use this for high-frequency UI-driven settings (toggles, dismissed
    // prompts); use `updateSetting` (pessimistic, invalidates) for admin
    // settings.
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
          // When there was no cache entry to patch (e.g. the boot-time settings
          // fetch is still in flight), fall back to invalidation — the
          // in-flight response carries the pre-PUT snapshot, so without a
          // refetch the write would be silently lost.
          if (patch.patches.length === 0) {
            dispatch(
              sessionApi.util.invalidateTags([tag("session-properties")]),
            );
          }
        } catch {
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

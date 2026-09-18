import { t } from "ttag";

import {
  EMPTY_MAPPINGS,
  GroupMappingsPanel,
  type GroupMappingsSaveResult,
  type GroupMappingsState,
  type SaveOptions,
  useGroupLookup,
} from "metabase/admin/settings/auth/components/GroupMappings";
import { getErrorMessage } from "metabase/api/utils/errors";
import { useToast } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  SwitchSettingsSection,
  useSwitchWrite,
} from "metabase/settings-components";
import type { BoxProps } from "metabase/ui";
import {
  type CustomOidcConfig,
  customOidcApi,
  useGetCustomOidcProvidersQuery,
  useUpdateCustomOidcMutation,
} from "metabase-enterprise/api";

import { type OidcGroupSync, toGroupSync } from "../group-sync";

export type GroupSyncWriter = {
  isSaving: boolean;
  saveGroupSync: (
    provider: CustomOidcConfig,
    changes: Partial<OidcGroupSync>,
    options?: SaveOptions,
  ) => Promise<GroupMappingsSaveResult>;
};

/** Writes the provider's group sync config with some fields replaced, since the API swaps the whole map */
export function useGroupSyncWriter(): GroupSyncWriter {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const [updateProvider, { isLoading: isSaving }] =
    useUpdateCustomOidcMutation();

  const saveGroupSync = async (
    provider: CustomOidcConfig,
    changes: Partial<OidcGroupSync>,
    { successMessage, showErrorToast = true }: SaveOptions = {},
  ): Promise<GroupMappingsSaveResult> => {
    const { data: savedProvider, error: writeError } = await updateProvider({
      key: provider.key,
      provider: { "group-sync": toGroupSync(provider["group-sync"], changes) },
    });
    if (writeError != null || savedProvider == null) {
      const error = getErrorMessage(writeError, t`Error saving group mapping`);
      if (showErrorToast) {
        sendToast({
          message: error,
          icon: "warning",
          toastColor: "feedback-negative",
        });
      }
      return { ok: false, error };
    }
    // show the saved provider right away instead of waiting for the refetch
    dispatch(
      customOidcApi.util.updateQueryData(
        "getCustomOidcProviders",
        undefined,
        (draft) => {
          const index = draft.findIndex((entry) => entry.key === provider.key);
          if (index !== -1) {
            draft[index] = savedProvider;
          }
        },
      ),
    );
    if (successMessage != null) {
      sendToast({ message: successMessage, icon: "check_filled" });
    }
    return { ok: true };
  };

  return { isSaving, saveGroupSync };
}

type OidcGroupMappingSectionProps = {
  // null until the provider is saved, and the card stays disabled until then
  provider: CustomOidcConfig | null;
  // the page's writer, since the switch, the mappings and the page form all write the one provider
  writer: GroupSyncWriter;
  // the group fields of the page form, shown only while group mapping is on
  children: React.ReactNode;
  // the env var that owns the providers, which the page names and the card only obeys
  lockedEnvName?: string;
  // true while the page form saves the provider, which a card write would race
  isPageSaving?: boolean;
  onToggle?: (enabled: boolean) => void;
} & BoxProps;

/** The group mapping card of an OIDC provider, with a switch that saves on its own and the mappings under it */
export function OidcGroupMappingSection({
  provider,
  writer,
  children,
  lockedEnvName,
  isPageSaving = false,
  onToggle,
  ...boxProps
}: OidcGroupMappingSectionProps) {
  const applicationName = useSelector(getApplicationName);
  const { isFetching: isProvidersFetching, startedTimeStamp } =
    useGetCustomOidcProvidersQuery();
  const { isSaving, saveGroupSync } = writer;
  // a refetch still in flight could answer with the value from before the write
  // the page form's save carries the group sync too, so the card waits for it as well
  const isWriting = isSaving || isProvidersFetching || isPageSaving;
  const isLocked = lockedEnvName != null;
  const { checked, onChange } = useSwitchWrite({
    storedValue: provider?.["group-sync"]?.enabled ?? false,
    isFetching: isProvidersFetching,
    startedTimeStamp,
    write: async (enabled) => {
      if (provider == null) {
        return false;
      }
      const result = await saveGroupSync(
        provider,
        { enabled },
        { successMessage: t`Changes saved` },
      );
      if (result.ok) {
        onToggle?.(enabled);
      }
      return result.ok;
    },
  });

  return (
    <SwitchSettingsSection
      title={t`Group mapping`}
      description={t`Automatically assign people to ${applicationName} groups based on groups from your OIDC provider`}
      checked={checked}
      disabled={provider == null}
      switchDisabled={isLocked}
      switchBusy={isWriting}
      onChange={onChange}
      {...boxProps}
    >
      {provider != null && (
        <OidcGroupMappings
          provider={provider}
          saveGroupSync={saveGroupSync}
          isWriting={isWriting}
          readOnly={isLocked}
        />
      )}
      {children}
    </SwitchSettingsSection>
  );
}

type OidcGroupMappingsProps = {
  provider: CustomOidcConfig;
  saveGroupSync: GroupSyncWriter["saveGroupSync"];
  isWriting: boolean;
  readOnly: boolean;
};

function OidcGroupMappings({
  provider,
  saveGroupSync,
  isWriting,
  readOnly,
}: OidcGroupMappingsProps) {
  const groupLookup = useGroupLookup();
  const groupMapping: GroupMappingsState = {
    mappings: provider["group-sync"]?.["group-mappings"] ?? EMPTY_MAPPINGS,
    saveMappings: (mappings, options) =>
      saveGroupSync(provider, { "group-mappings": mappings }, options),
  };

  return (
    <GroupMappingsPanel
      groupMapping={groupMapping}
      groupLookup={groupLookup}
      isBusy={isWriting}
      readOnly={readOnly}
      nameLabel={t`OIDC group name`}
      namePlaceholder={t`Enter OIDC group...`}
    />
  );
}

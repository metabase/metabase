import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  EMPTY_MAPPINGS,
  GroupMappingsPanel,
  type GroupMappingsSaveResult,
  type SaveOptions,
  useGroupLookup,
} from "metabase/admin/settings/auth/components/GroupMappings";
import { getErrorMessage } from "metabase/api/utils/errors";
import { useToast } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { SwitchSettingsSection } from "metabase/settings-components";
import { type BoxProps, Text } from "metabase/ui";
import {
  type CustomOidcConfig,
  customOidcApi,
  useGetCustomOidcProvidersQuery,
  useUpdateCustomOidcMutation,
} from "metabase-enterprise/api";

import { type OidcGroupSync, toGroupSync } from "../group-sync";

type OidcGroupMappingSectionProps = {
  // null until the provider is saved, and the card stays disabled until then
  provider: CustomOidcConfig | null;
  // reports the card's writes and deletions, so the page's save waits for them
  onSavingChange?: (isSaving: boolean) => void;
  // the group fields of the page form, shown only while group mapping is on
  children: React.ReactNode;
  // the env var that owns the providers, which locks the card and is named in it
  lockedEnvName?: string;
  // true while the page form saves the provider, which a card write would race
  isPageSaving?: boolean;
  disabled?: boolean;
  onToggle?: (enabled: boolean) => void;
} & BoxProps;

/** The group mapping card of an OIDC provider, with a switch that saves on its own and the mappings under it */
export function OidcGroupMappingSection({
  provider,
  onSavingChange,
  children,
  lockedEnvName,
  isPageSaving = false,
  disabled = false,
  onToggle,
  ...boxProps
}: OidcGroupMappingSectionProps) {
  const applicationName = useSelector(getApplicationName);
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  // OIDC users are never tenants, so tenant groups stay out of the picker
  const groupLookup = useGroupLookup({ tenancy: "internal" });
  const { isFetching: isProvidersFetching } = useGetCustomOidcProvidersQuery();
  const [updateProvider, { isLoading: isUpdating }] =
    useUpdateCustomOidcMutation();
  const [isDeleting, setIsDeleting] = useState(false);
  // a deletion makes several writes, and nothing else may write the provider between them
  const isSaving = isUpdating || isDeleting;
  // the page form writes the same provider, so its save waits while the card saves
  useEffect(() => {
    onSavingChange?.(isSaving);
  }, [isSaving, onSavingChange]);
  // a refetch still in flight could answer with the value from before the write
  // the page form's save carries the group sync too, so the card waits for it as well
  const isWriting = isSaving || isProvidersFetching || isPageSaving;
  const isLocked = lockedEnvName != null;
  const isUnconfigured = disabled || provider == null;
  const isLockedUntilSave = isUnconfigured && !isLocked;

  // writes the group sync with some fields replaced, since the API swaps the whole map
  const saveGroupSync = async (
    current: CustomOidcConfig,
    changes: Partial<OidcGroupSync>,
    { successMessage, showErrorToast = true }: SaveOptions = {},
  ): Promise<GroupMappingsSaveResult> => {
    const { data: savedProvider, error: writeError } = await updateProvider({
      key: current.key,
      provider: { "group-sync": toGroupSync(current["group-sync"], changes) },
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
          const index = draft.findIndex((entry) => entry.key === current.key);
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

  const handleChange = async (enabled: boolean) => {
    if (provider == null) {
      return;
    }
    // show the click at once and let the write confirm it
    const patch = dispatch(
      customOidcApi.util.updateQueryData(
        "getCustomOidcProviders",
        undefined,
        (draft) => {
          const entry = draft.find(
            (candidate) => candidate.key === provider.key,
          );
          if (entry != null) {
            entry["group-sync"] = toGroupSync(entry["group-sync"], { enabled });
          }
        },
      ),
    );
    const result = await saveGroupSync(
      provider,
      { enabled },
      { successMessage: t`Changes saved` },
    );
    if (result.ok) {
      onToggle?.(enabled);
    } else {
      patch.undo();
    }
  };

  return (
    <SwitchSettingsSection
      title={t`Group mapping`}
      description={t`Automatically assign people to ${applicationName} groups based on groups from your OIDC provider`}
      note={
        isLockedUntilSave && (
          <Text c="text-secondary" mt="sm">
            {t`Save the settings above to set up group mapping.`}
          </Text>
        )
      }
      checked={provider?.["group-sync"]?.enabled ?? false}
      disabled={isUnconfigured}
      switchDisabled={isWriting}
      lockedEnvName={lockedEnvName}
      onChange={handleChange}
      {...boxProps}
    >
      {provider != null && (
        <GroupMappingsPanel
          mappings={
            provider["group-sync"]?.["group-mappings"] ?? EMPTY_MAPPINGS
          }
          saveMappings={(mappings, options) =>
            saveGroupSync(provider, { "group-mappings": mappings }, options)
          }
          // every write sends the whole group sync, so nothing else may write it mid-cascade
          onDeletingChange={setIsDeleting}
          groupLookup={groupLookup}
          disabled={isWriting}
          readOnly={isLocked}
          nameLabel={t`OIDC group name`}
          namePlaceholder={t`Enter OIDC group...`}
        />
      )}
      {children}
    </SwitchSettingsSection>
  );
}

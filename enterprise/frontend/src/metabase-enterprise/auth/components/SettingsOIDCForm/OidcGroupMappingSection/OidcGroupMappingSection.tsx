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
import type { BoxProps } from "metabase/ui";
import {
  type CustomOidcConfig,
  customOidcApi,
  useGetCustomOidcProvidersQuery,
  useUpdateCustomOidcMutation,
} from "metabase-enterprise/api";

import { type OidcGroupSync, toGroupSync } from "../group-sync";

type OidcGroupMappingSectionProps = {
  provider: CustomOidcConfig | null;
  onSavingChange?: (isSaving: boolean) => void;
  children: React.ReactNode;
  lockedEnvName?: string;
  isPageSaving?: boolean;
  disabled?: boolean;
  onToggle?: (enabled: boolean) => void;
} & BoxProps;

/** OIDC group mapping card whose switch and mappings save apart from the page form */
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
  const groupLookup = useGroupLookup({ tenancy: "internal" });
  const { isFetching: isProvidersFetching } = useGetCustomOidcProvidersQuery();
  const [updateProvider, { isLoading: isUpdating }] =
    useUpdateCustomOidcMutation();
  const [isDeleting, setIsDeleting] = useState(false);
  // a deletion makes several writes, and nothing else may write the provider between them
  const isSaving = isUpdating || isDeleting;
  useEffect(() => {
    onSavingChange?.(isSaving);
  }, [isSaving, onSavingChange]);
  // a refetch still in flight could answer with the value from before the write
  const isWriting = isSaving || isProvidersFetching || isPageSaving;
  const isLocked = lockedEnvName != null;
  const isUnconfigured = disabled || provider == null;
  const isLockedUntilSave = isUnconfigured && !isLocked;

  const patchCachedProvider = (shown: CustomOidcConfig) =>
    dispatch(
      customOidcApi.util.updateQueryData(
        "getCustomOidcProviders",
        undefined,
        (draft) => {
          const index = draft.findIndex((entry) => entry.key === shown.key);
          if (index !== -1) {
            draft[index] = shown;
          }
        },
      ),
    );

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
          variant: "negative",
        });
      }
      return { ok: false, error };
    }
    patchCachedProvider(savedProvider);
    if (successMessage != null) {
      sendToast({ message: successMessage, icon: "check_filled" });
    }
    return { ok: true };
  };

  const handleChange = async (enabled: boolean) => {
    if (provider == null) {
      return;
    }
    const patch = patchCachedProvider({
      ...provider,
      "group-sync": toGroupSync(provider["group-sync"], { enabled }),
    });
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
        isLockedUntilSave && t`Save the settings above to set up group mapping.`
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

import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  GroupMappingsPanel,
  type GroupMappingsSaveResult,
  type GroupMappingsState,
  type MappingsType,
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

const EMPTY_MAPPINGS: MappingsType = {};

// the card owns the group sync map, so the claim it reads lives here
export const DEFAULT_GROUP_ATTRIBUTE = "groups";

type GroupSync = NonNullable<CustomOidcConfig["group-sync"]>;

type SaveOptions = {
  successMessage?: string;
  // the row editor shows a failure under its field, everything else toasts it
  showErrorToast?: boolean;
};

type GroupSyncWriter = {
  isSaving: boolean;
  saveGroupSync: (
    provider: CustomOidcConfig,
    changes: Partial<GroupSync>,
    options?: SaveOptions,
  ) => Promise<GroupMappingsSaveResult>;
};

/** Writes the provider's group sync config with some fields replaced, since the API swaps the whole map */
function useGroupSyncWriter(): GroupSyncWriter {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const [updateProvider, { isLoading: isSaving }] =
    useUpdateCustomOidcMutation();

  const saveGroupSync = async (
    provider: CustomOidcConfig,
    changes: Partial<GroupSync>,
    { successMessage, showErrorToast = true }: SaveOptions = {},
  ): Promise<GroupMappingsSaveResult> => {
    const groupSync = provider["group-sync"] ?? {};
    const { data: savedProvider, error: writeError } = await updateProvider({
      key: provider.key,
      provider: {
        "group-sync": {
          enabled: groupSync.enabled ?? false,
          "group-attribute":
            groupSync["group-attribute"] ?? DEFAULT_GROUP_ATTRIBUTE,
          "group-mappings": groupSync["group-mappings"] ?? EMPTY_MAPPINGS,
          ...changes,
        },
      },
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
  // the group fields of the page form, shown only while group mapping is on
  children: React.ReactNode;
  onToggle?: (enabled: boolean) => void;
} & BoxProps;

/** The group mapping card of an OIDC provider, with a switch that saves on its own and the mappings under it */
export function OidcGroupMappingSection({
  provider,
  children,
  onToggle,
  ...boxProps
}: OidcGroupMappingSectionProps) {
  const applicationName = useSelector(getApplicationName);
  const { isFetching: isProvidersFetching } = useGetCustomOidcProvidersQuery();
  // one writer for the whole card, since the switch and the mappings share the one group sync map
  const writer = useGroupSyncWriter();
  const { isSaving, saveGroupSync } = writer;
  const [clickedValue, setClickedValue] = useState<boolean | null>(null);
  // a refetch still in flight could answer with the value from before the write
  const isWriting = isSaving || isProvidersFetching;
  const storedValue = provider?.["group-sync"]?.enabled ?? false;
  // the click shows right away, and the stored value takes over once a refetch brings it back
  const isChecked = clickedValue ?? storedValue;

  useEffect(() => {
    if (clickedValue != null && storedValue === clickedValue) {
      setClickedValue(null);
    }
  }, [clickedValue, storedValue]);

  const handleChange = async (enabled: boolean) => {
    if (provider == null) {
      return;
    }
    setClickedValue(enabled);
    const result = await saveGroupSync(
      provider,
      { enabled },
      { successMessage: t`Changes saved` },
    );
    if (result.ok) {
      onToggle?.(enabled);
    } else {
      setClickedValue(null);
    }
  };

  return (
    <SwitchSettingsSection
      title={t`Group mapping`}
      description={t`Automatically assign people to ${applicationName} groups based on groups from your OIDC provider`}
      checked={isChecked}
      disabled={provider == null}
      switchBusy={isWriting}
      onChange={handleChange}
      {...boxProps}
    >
      {provider != null && (
        <OidcGroupMappings
          provider={provider}
          writer={writer}
          isWriting={isWriting}
        />
      )}
      {children}
    </SwitchSettingsSection>
  );
}

type OidcGroupMappingsProps = {
  provider: CustomOidcConfig;
  writer: GroupSyncWriter;
  // true while the card's own write or a providers refetch is in flight
  isWriting: boolean;
};

function OidcGroupMappings({
  provider,
  writer,
  isWriting,
}: OidcGroupMappingsProps) {
  const groupLookup = useGroupLookup();
  const { isSaving, saveGroupSync } = writer;
  const groupMapping: GroupMappingsState = {
    mappings: provider["group-sync"]?.["group-mappings"] ?? EMPTY_MAPPINGS,
    isSaving,
    saveMappings: (mappings, options) =>
      saveGroupSync(provider, { "group-mappings": mappings }, options),
  };

  return (
    <GroupMappingsPanel
      groupMapping={groupMapping}
      groupLookup={groupLookup}
      // a providers refetch can still answer with the value from before the write
      isBusy={isWriting}
      nameLabel={t`OIDC group name`}
      namePlaceholder={t`Enter OIDC group...`}
    />
  );
}

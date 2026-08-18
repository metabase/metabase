import { useDisclosure } from "@mantine/hooks";
import type { ChangeEvent } from "react";
import { t } from "ttag";

import {
  useAdminSetting,
  useAdminSettings,
  useSetting,
} from "metabase/settings";
import { Switch, type SwitchProps, Text } from "metabase/ui";

import { EmbeddingLegaleseModal } from "../EmbeddingLegaleseModal";

export type EmbeddingSettingKey =
  | "enable-embedding-static"
  | "enable-embedding-sdk"
  | "enable-embedding-interactive"
  | "enable-embedding-simple";

export type EmbeddingToggleProps = {
  settingKey: EmbeddingSettingKey;
  dependentSettingKeys?: EmbeddingSettingKey[];
  /**
   * Settings this switch stands in for, rather than depends on. One switch
   * presents several embedding methods: it reads on when any of them is on and
   * writes all of them at once.
   *
   * Temporary: EMB-2257 gives the merged switch a single setting to read and
   * write, and deletes this prop with the fan-out.
   */
  mergedSettingKeys?: EmbeddingSettingKey[];
} & Omit<SwitchProps, "onChange">;

export function EmbeddingToggle({
  settingKey,
  dependentSettingKeys = [],
  mergedSettingKeys = [],
  labelPosition = "left",
  ...switchProps
}: EmbeddingToggleProps) {
  const { value, settingDetails } = useAdminSetting(settingKey);
  const { values: dependentSettingsValues, updateSettings } =
    useAdminSettings(dependentSettingKeys);
  const { values: mergedValues, details: mergedDetails } =
    useAdminSettings(mergedSettingKeys);

  const showSdkEmbedTerms = useSetting("show-sdk-embed-terms");
  const showSimpleEmbedTerms = useSetting("show-simple-embed-terms");

  const [
    isLegaleseModalOpen,
    { open: openLegaleseModal, close: closeLegaleseModal },
  ] = useDisclosure(false);

  // A merged switch has to write every setting it stands for. It cannot write
  // an env-pinned one, and writing the rest would leave the instance in the
  // mixed state the merge exists to remove, so one pinned setting locks the row.
  const isPinnedToEnv =
    settingDetails?.is_env_setting ||
    Object.values(mergedDetails).some((detail) => detail?.is_env_setting);

  if (isPinnedToEnv) {
    return <Text c="text-secondary">{t`Set via environment variable`}</Text>;
  }

  const isEnabled =
    mergedSettingKeys.length > 0
      ? Boolean(value) || Object.values(mergedValues).some(Boolean)
      : Boolean(value) && Object.values(dependentSettingsValues).every(Boolean);

  const isEmbeddingToggle =
    settingKey === "enable-embedding-sdk" ||
    settingKey === "enable-embedding-simple";

  const handleChange = (checked: boolean) => {
    const shouldShowEmbedTerms =
      (settingKey === "enable-embedding-sdk" && showSdkEmbedTerms) ||
      (settingKey === "enable-embedding-simple" && showSimpleEmbedTerms);

    if (shouldShowEmbedTerms && isEmbeddingToggle && checked) {
      openLegaleseModal();
      return;
    }

    const settingKeys = [
      settingKey,
      ...dependentSettingKeys,
      ...mergedSettingKeys,
    ];

    updateSettings(
      Object.fromEntries(settingKeys.map((key) => [key, checked])),
    );
  };

  return (
    <>
      <Switch
        label={isEnabled ? t`Enabled` : t`Disabled`}
        size="sm"
        labelPosition={labelPosition}
        checked={isEnabled}
        wrapperProps={{
          "data-testid": "switch-with-env-var",
        }}
        {...switchProps}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          handleChange(event.currentTarget.checked);
        }}
      />

      {isEmbeddingToggle && (
        <EmbeddingLegaleseModal
          setting={settingKey}
          opened={isLegaleseModalOpen}
          onClose={closeLegaleseModal}
        />
      )}
    </>
  );
}

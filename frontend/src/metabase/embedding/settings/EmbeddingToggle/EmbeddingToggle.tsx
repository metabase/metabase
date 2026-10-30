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
  | "enable-embedding-interactive"
  | "enable-embedding-modular"
  | "enable-embedding-sdk"
  | "enable-embedding-sidecar";

export type EmbeddingToggleProps = {
  settingKey: EmbeddingSettingKey;
  dependentSettingKeys?: EmbeddingSettingKey[];
  requiresTerms?: boolean;
} & Omit<SwitchProps, "onChange">;

export function EmbeddingToggle({
  settingKey,
  dependentSettingKeys = [],
  requiresTerms = false,
  labelPosition = "left",
  ...switchProps
}: EmbeddingToggleProps) {
  const { value, settingDetails } = useAdminSetting(settingKey);
  const { values: dependentSettingsValues, updateSettings } =
    useAdminSettings(dependentSettingKeys);

  const showModularEmbedTerms = useSetting("show-modular-embed-terms");

  const [
    isLegaleseModalOpen,
    { open: openLegaleseModal, close: closeLegaleseModal },
  ] = useDisclosure(false);

  if (settingDetails?.is_env_setting) {
    return <Text c="text-secondary">{t`Set via environment variable`}</Text>;
  }

  const isEnabled =
    Boolean(value) && Object.values(dependentSettingsValues).every(Boolean);

  const shouldShowModularEmbedTerms =
    requiresTerms && isModularEmbeddingSettingKey(settingKey);

  const handleChange = (checked: boolean) => {
    if (showModularEmbedTerms && shouldShowModularEmbedTerms && checked) {
      openLegaleseModal();
      return;
    }

    const settingKeys = [settingKey, ...dependentSettingKeys];

    updateSettings(
      Object.fromEntries(settingKeys.map((key) => [key, checked])),
    );
  };

  return (
    <>
      <Switch
        label={isEnabled ? t`Enabled` : t`Disabled`}
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

      {shouldShowModularEmbedTerms && (
        <EmbeddingLegaleseModal
          opened={isLegaleseModalOpen}
          onClose={closeLegaleseModal}
          settingKey={settingKey}
        />
      )}
    </>
  );
}

function isModularEmbeddingSettingKey(
  settingKey: EmbeddingSettingKey,
): settingKey is "enable-embedding-modular" | "enable-embedding-sdk" {
  return (
    settingKey === "enable-embedding-modular" ||
    settingKey === "enable-embedding-sdk"
  );
}

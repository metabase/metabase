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
  | "enable-embedding-modular";

export type EmbeddingToggleProps = {
  settingKey: EmbeddingSettingKey;
  dependentSettingKeys?: EmbeddingSettingKey[];
} & Omit<SwitchProps, "onChange">;

export function EmbeddingToggle({
  settingKey,
  dependentSettingKeys = [],
  labelPosition = "left",
  ...switchProps
}: EmbeddingToggleProps) {
  const { value, settingDetails } = useAdminSetting(settingKey);
  const { values: dependentSettingsValues, updateSettings } =
    useAdminSettings(dependentSettingKeys);

  const showSdkEmbedTerms = useSetting("show-sdk-embed-terms");
  const showSimpleEmbedTerms = useSetting("show-simple-embed-terms");

  const [
    isLegaleseModalOpen,
    { open: openLegaleseModal, close: closeLegaleseModal },
  ] = useDisclosure(false);

  if (settingDetails?.is_env_setting) {
    return <Text c="text-secondary">{t`Set via environment variable`}</Text>;
  }

  const isEnabled =
    Boolean(value) && Object.values(dependentSettingsValues).every(Boolean);

  const isEmbeddingToggle = settingKey === "enable-embedding-modular";

  const handleChange = (checked: boolean) => {
    const shouldShowEmbedTerms = showSdkEmbedTerms || showSimpleEmbedTerms;

    if (shouldShowEmbedTerms && isEmbeddingToggle && checked) {
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
          opened={isLegaleseModalOpen}
          onClose={closeLegaleseModal}
        />
      )}
    </>
  );
}

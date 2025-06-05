import { useDisclosure } from "@mantine/hooks";
import type { ChangeEvent } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { useSetting } from "metabase/common/hooks";
import { Switch, type SwitchProps, Text } from "metabase/ui";

import { EmbeddingSdkLegaleseModal } from "../EmbeddingSdkLegaleseModal";

export type EmbeddingToggleProps = {
  settingKey:
    | "enable-embedding-static"
    | "enable-embedding-sdk"
    | "enable-embedding-interactive";
} & Omit<SwitchProps, "onChange">;

export function EmbeddingToggle({
  settingKey,
  ...switchProps
}: EmbeddingToggleProps) {
  const { value, settingDetails, updateSetting } = useAdminSetting(settingKey);
  const showSdkEmbedTerms = useSetting("show-sdk-embed-terms");

  const [
    isLegaleseModalOpen,
    { open: openLegaleseModal, close: closeLegaleseModal },
  ] = useDisclosure(false);

  if (settingDetails?.is_env_setting) {
    return (
      <Text c="var(--mb-color-text-secondary)">{t`Set via environment variable`}</Text>
    );
  }
  const isEnabled = Boolean(value);
  const isEmbeddingToggle = settingKey === "enable-embedding-sdk";

  const handleChange = (newValue: boolean) => {
    if (showSdkEmbedTerms && isEmbeddingToggle && newValue) {
      openLegaleseModal();
      return;
    }

    updateSetting({
      key: settingKey,
      value: newValue,
    });
  };

  return (
    <>
      <Switch
        label={isEnabled ? t`Enabled` : t`Disabled`}
        size="sm"
        labelPosition="left"
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
        <EmbeddingSdkLegaleseModal
          opened={isLegaleseModalOpen}
          onClose={closeLegaleseModal}
        />
      )}
    </>
  );
}

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
  const isEmbeddingSdkEnabled = useSetting("enable-embedding-sdk");

  const [
    isLegaleseModalOpen,
    { open: openLegaleseModal, close: closeLegaleseModal },
  ] = useDisclosure(Boolean(isEmbeddingSdkEnabled && showSdkEmbedTerms));

  if (settingDetails?.is_env_setting) {
    return (
      <Text c="var(--mb-color-text-secondary)">{t`Set via environment variable`}</Text>
    );
  }
  const isEnabled = Boolean(value);

  const handleChange = (newValue: boolean) => {
    if (
      showSdkEmbedTerms &&
      settingKey === "enable-embedding-sdk" &&
      newValue
    ) {
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
      <EmbeddingSdkLegaleseModal
        opened={isLegaleseModalOpen}
        onClose={closeLegaleseModal}
      />
    </>
  );
}

import { useDisclosure } from "@mantine/hooks";
import type { ChangeEvent } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { useSetting } from "metabase/common/hooks";
import { Switch, type SwitchProps, Text } from "metabase/ui";

import { EmbeddingLegaleseModal } from "../EmbeddingLegaleseModal";

export type EmbeddingToggleProps = {
  settingKey:
    | "enable-embedding-static"
    | "enable-embedding-sdk"
    | "enable-embedding-interactive"
    | "enable-embedding-simple";
} & Omit<SwitchProps, "onChange">;

export function EmbeddingToggle({
  settingKey,
  labelPosition = "left",
  ...switchProps
}: EmbeddingToggleProps) {
  const { value, settingDetails, updateSetting } = useAdminSetting(settingKey);
  const showSdkEmbedTerms = useSetting("show-sdk-embed-terms");
  const showSimpleEmbedTerms = useSetting("show-simple-embed-terms");

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

  const isEmbeddingToggle =
    settingKey === "enable-embedding-sdk" ||
    settingKey === "enable-embedding-simple";

  const handleChange = (newValue: boolean) => {
    const shouldShowEmbedTerms =
      (settingKey === "enable-embedding-sdk" && showSdkEmbedTerms) ||
      (settingKey === "enable-embedding-simple" && showSimpleEmbedTerms);

    if (shouldShowEmbedTerms && isEmbeddingToggle && newValue) {
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

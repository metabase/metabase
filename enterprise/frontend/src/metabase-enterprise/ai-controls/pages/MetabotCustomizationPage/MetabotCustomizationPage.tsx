import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { TextInput } from "metabase/ui";
import { useAdminSettingWithDebouncedInput } from "metabase-enterprise/ai-controls/hooks";

import { MetabotIconField } from "./MetabotIconField";

export function MetabotCustomizationPage() {
  const { handleInputChange, inputValue: nameInput } =
    useAdminSettingWithDebouncedInput<string | null>("metabot-name");

  return (
    <SettingsPageWrapper title={t`Customization`} mt="sm">
      <SettingsSection
        description={t`Customize how Metabot appears to users.`}
        title={t`Identity`}
      >
        <TextInput
          label={t`Metabot's name`}
          placeholder={t`Metabot`}
          mb="sm"
          value={nameInput || ""}
          onChange={(e) => handleInputChange(e.target.value)}
          error={nameInput ? undefined : t`Metabot's name is required`}
        />
        <MetabotIconField />
      </SettingsSection>
    </SettingsPageWrapper>
  );
}

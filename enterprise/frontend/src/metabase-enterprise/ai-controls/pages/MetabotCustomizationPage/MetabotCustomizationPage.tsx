import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { TextInput } from "metabase/ui";
import { useAdminSettingWithDebouncedInput } from "metabase-enterprise/ai-controls/hooks";

import { MetabotIconField } from "./MetabotIconField";

export function MetabotCustomizationPage() {
  const applicationName = useSelector(getApplicationName);
  const { handleInputChange, inputValue: nameInput } =
    useAdminSettingWithDebouncedInput<string | null>("metabot-name");

  return (
    <SettingsPageWrapper title={t`Customization`} mt="sm">
      <SettingsSection
        description={t`Customize how ${applicationName}'s AI agent appears to users.`}
        title={t`Identity`}
      >
        <TextInput
          label={t`AI agent's name`}
          placeholder={t`Metabot`}
          mb="sm"
          value={nameInput || ""}
          onChange={(e) => handleInputChange(e.target.value)}
          error={nameInput ? undefined : t`AI agent's name is required`}
        />
        <MetabotIconField />
      </SettingsSection>
    </SettingsPageWrapper>
  );
}

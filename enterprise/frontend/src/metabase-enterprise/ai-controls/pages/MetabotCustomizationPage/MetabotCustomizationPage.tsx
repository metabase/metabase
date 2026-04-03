import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useAdminSetting } from "metabase/api/utils";
import { TextInput } from "metabase/ui";

import { MetabotIconField } from "./MetabotIconField";

const SAVE_DEBOUNCE_MS = 500;

export function MetabotCustomizationPage() {
  const { value: initialInputValue, updateSetting: updateName } =
    useAdminSetting("metabot-name");
  const [nameInput, setNameInput] = useState<string>();

  useEffect(() => {
    if (nameInput === undefined && initialInputValue !== undefined) {
      setNameInput(initialInputValue ?? "");
    }
  }, [initialInputValue, nameInput]);

  const debouncedSaveName = useDebouncedCallback((value: string) => {
    if (value) {
      updateName({ key: "metabot-name", value, toast: false });
    }
  }, SAVE_DEBOUNCE_MS);

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
          value={nameInput}
          onChange={(e) => {
            setNameInput(e.currentTarget.value);
            debouncedSaveName(e.currentTarget.value);
          }}
          error={nameInput ? undefined : t`Metabot's name is required`}
        />
        <MetabotIconField />
      </SettingsSection>
    </SettingsPageWrapper>
  );
}

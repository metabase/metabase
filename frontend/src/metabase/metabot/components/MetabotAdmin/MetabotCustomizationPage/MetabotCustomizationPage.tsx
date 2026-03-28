import { useDebouncedCallback } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useAdminSetting } from "metabase/api/utils";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { TextInput, Textarea } from "metabase/ui";

import { MetabotNavPane } from "../MetabotNavPane";

import { MetabotIconField } from "./MetabotIconField";

const SAVE_DEBOUNCE_MS = 500;

export function MetabotCustomizationPage() {
  const { value: metabotName, updateSetting: updateName } =
    useAdminSetting("metabot-name");
  const { value: metabotTone, updateSetting: updateTone } =
    useAdminSetting("metabot-tone");

  const [nameInput, setNameInput] = useState<string>(metabotName ?? "");
  const [toneInput, setToneInput] = useState<string>(metabotTone ?? "");

  const debouncedSaveName = useDebouncedCallback((value: string) => {
    updateName({ key: "metabot-name", value, toast: false });
  }, SAVE_DEBOUNCE_MS);

  const debouncedSaveTone = useDebouncedCallback((value: string) => {
    updateTone({ key: "metabot-tone", value, toast: false });
  }, SAVE_DEBOUNCE_MS);

  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
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
          />
          <MetabotIconField />
          <Textarea
            description={t`Tell Metabot how to respond. For example, "Be brief and direct" or "Be friendly and conversational."`}
            descriptionProps={{
              c: "text-secondary",
              fz: "md",
              lh: "lg",
            }}
            label={t`Tone instructions`}
            labelProps={{ lh: "lg" }}
            placeholder={t`Be friendly (but not jokey), professional, and to-the-point. Be precise and correct.`}
            minRows={15}
            value={toneInput}
            onChange={(e) => {
              setToneInput(e.currentTarget.value);
              debouncedSaveTone(e.currentTarget.value);
            }}
          />
        </SettingsSection>
      </SettingsPageWrapper>
    </AdminSettingsLayout>
  );
}

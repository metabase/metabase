import { useState } from "react";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Text, Textarea } from "metabase/ui";

import { MetabotNavPane } from "../MetabotNavPane";

import S from "./MetabotSystemPromptsPage.module.css";

export function MetabotSystemPromptsPage() {
  const applicationName = useSelector(getApplicationName);
  const [promptText, setPromptText] = useState<string>("");

  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
      <SettingsPageWrapper title={t`System prompt`} mt="xl">
        <SettingsSection>
          <LoadingAndErrorWrapper loading={false}>
            <Text c="text-secondary" size="md" mb="lg">
              {t`You can give instructions here for any and all AI-backed features in ${applicationName}, from NLQ, to SQL code generation.`}
            </Text>
            <Textarea
              aria-label={t`System prompt`}
              placeholder={
                t`# Here’s a section` +
                "\n" +
                t`1. Do this` +
                "\n" +
                t`2. And this` +
                "\n" +
                t`3. And lastly, this`
              }
              value={promptText}
              onChange={(e) => {
                setPromptText(e.currentTarget.value);
              }}
              className={S.textareaWrapper}
            />
          </LoadingAndErrorWrapper>
        </SettingsSection>
      </SettingsPageWrapper>
    </AdminSettingsLayout>
  );
}

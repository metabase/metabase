import { t } from "ttag";

import {
  AdminSettingInput,
  SettingsSection,
} from "metabase/settings-components";

export function WebSearchSettingsSection({ id }: { id?: string }) {
  return (
    <SettingsSection id={id} title={t`Web search`}>
      <AdminSettingInput
        name="metabot-web-search-api-key"
        title={t`Serper API key`}
        description={t`Allow Metabot to search the web and read web pages using Serper. Add an API key to enable web search, or clear it to disable web search.`}
        inputType="password"
      />
    </SettingsSection>
  );
}

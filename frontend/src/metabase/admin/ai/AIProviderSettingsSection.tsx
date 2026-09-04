import { t } from "ttag";

import { useListLlmProvidersQuery } from "metabase/api";
import { AIProviderList } from "metabase/metabot";
import { SettingsSection } from "metabase/settings-components/SettingsSection";

export function AIProviderSettingsSection({ id }: { id?: string }) {
  const { data: connections = [] } = useListLlmProvidersQuery();

  const hasConnections = connections.length > 0;

  return (
    <SettingsSection
      id={id}
      stackProps={{ gap: "sm" }}
      title={hasConnections ? t`AI providers` : t`Connect to an AI provider`}
      description={
        !hasConnections
          ? t`Select your AI provider to use AI explorations, SQL generation and Metabot.`
          : t`Metabot can use models from any of these providers.`
      }
    >
      <AIProviderList />
    </SettingsSection>
  );
}

import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useListLlmProvidersQuery } from "metabase/api";
import { AIProviderConfigurationForm } from "metabase/metabot";
import { Badge, Flex, Group } from "metabase/ui";

export function AIProviderSettingsSection({ id }: { id?: string }) {
  const { data: connections = [] } = useListLlmProvidersQuery();

  const hasConnections = connections.length > 0;
  const hasUnusableConnection = connections.some(
    (connection) => !connection.usable,
  );

  return (
    <SettingsSection
      id={id}
      title={
        <Flex justify="space-between" align="center">
          <Group gap="xs" wrap="nowrap">
            {hasConnections && (
              <Badge
                color={hasUnusableConnection ? "negative" : "positive"}
                indicator
                mr="sm"
              />
            )}
            <div>
              {hasConnections ? t`AI providers` : t`Connect to an AI provider`}
            </div>
          </Group>
        </Flex>
      }
      description={
        !hasConnections
          ? t`Select your AI provider to use AI explorations, SQL generation and Metabot.`
          : t`Metabot can use models from any of these providers.`
      }
    >
      <AIProviderConfigurationForm />
    </SettingsSection>
  );
}

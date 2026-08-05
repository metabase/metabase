import type { ReactNode } from "react";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Box, Flex, Stack, Text, Title } from "metabase/ui";

import {
  type EmbeddingSettingKey,
  EmbeddingToggle,
} from "../EmbeddingToggle/EmbeddingToggle";

/**
 * The embedding methods, as one card of rows rather than a card per method.
 *
 * Guest embeds stay their own row. The design folds guest into the modular
 * toggle, but that merge is sequenced separately: it changes which of two
 * consent moments survives, and that is unanswered. Modular and SDK are merged
 * here, which is safe -- both already prompt at the admin toggle.
 */
export function EmbeddingMethodsCard() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  return (
    <SettingsSection>
      <Stack gap="lg">
        <Title order={4}>{t`Availability of embedding methods`}</Title>

        {hasSimpleEmbedding && (
          <EmbeddingMethodRow
            title={t`Modular embedding and SDK for React`}
            description={t`Embed the full power of Metabase into your application with modular embedding and the React SDK to build custom analytics experiences and programmatically manage dashboards and data.`}
            settingKey="enable-embedding-simple"
            dependentSettingKeys={["enable-embedding-sdk"]}
          />
        )}

        <EmbeddingMethodRow
          title={t`Guest embeds`}
          description={t`A secure way to embed charts and dashboards, without single sign-on, when you don't want to offer ad-hoc querying or chart drill-through.`}
          settingKey="enable-embedding-static"
        />

        <EmbeddingMethodRow
          title={t`Full-app embedding`}
          description={t`A way to embed the entire Metabase app in an iframe. This involves hard trade-off and is generally not recommended unless you know exactly what you are doing.`}
          settingKey="enable-embedding-interactive"
        />
      </Stack>
    </SettingsSection>
  );
}

function EmbeddingMethodRow({
  title,
  description,
  settingKey,
  dependentSettingKeys,
}: {
  title: string;
  description: ReactNode;
  settingKey: EmbeddingSettingKey;
  dependentSettingKeys?: EmbeddingSettingKey[];
}) {
  return (
    <Flex gap="xl" justify="space-between" align="flex-start">
      <Box maw="38rem">
        <Text fw="bold" c="text-primary" mb="xs">
          {title}
        </Text>
        <Text c="text-secondary" lh="1.35rem">
          {description}
        </Text>
      </Box>

      <EmbeddingToggle
        settingKey={settingKey}
        dependentSettingKeys={dependentSettingKeys}
      />
    </Flex>
  );
}

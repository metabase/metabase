import type { ReactNode } from "react";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Box, Flex, Stack, Text, Title } from "metabase/ui";

import {
  type EmbeddingSettingKey,
  EmbeddingToggle,
} from "../EmbeddingToggle/EmbeddingToggle";

type EmbeddingMethod = {
  title: string;
  description: ReactNode;
  settingKey: EmbeddingSettingKey;
  mergedSettingKeys?: EmbeddingSettingKey[];
};

/**
 * The embedding methods, as one card of rows rather than a card per method.
 *
 * Modular embedding, the SDK and guest embeds share one switch, per the design:
 * separate switches add complexity without adding security, since whoever can
 * embed also controls them, and guest is a property of modular rather than a
 * method beside it. Full-app keeps its own.
 *
 * The merge is presentational for now -- the switch writes all three settings
 * and reads on when any is on, which is what the backend flag will do once
 * EMB-2257 replaces them with one.
 *
 * Guest embeds is the only free method, so OSS keeps a guest-only row. Modular
 * embedding, the SDK and full-app all need `embedding_simple`: the client only
 * registers the modular runtime when the token has it, so showing their toggles
 * below the paywall offers switches that turn nothing on. The settings
 * themselves carry no `:feature`, so nothing server-side stops an OSS admin
 * writing them -- see the note in the tech doc.
 */
export function EmbeddingMethodsCard() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  const modularEmbedding: EmbeddingMethod = {
    title: t`Modular embedding and SDK for React`,
    description: t`The simplest way to embed Metabase. Embed dashboards, questions, the query builder, natural language querying with AI, and more in your app with components, or build a fully custom analytics experience with the SDK for React.`,
    settingKey: "enable-embedding-simple",
    mergedSettingKeys: ["enable-embedding-sdk", "enable-embedding-static"],
  };

  const guestEmbeds: EmbeddingMethod = {
    title: t`Guest embeds`,
    description: t`A secure way to embed charts and dashboards, without single sign-on, when you don't want to offer ad-hoc querying or chart drill-through.`,
    settingKey: "enable-embedding-static",
  };

  const fullApp: EmbeddingMethod = {
    title: t`Full-app embedding`,
    description: t`A way to embed the entire Metabase app in an iframe. This involves hard trade-off and is generally not recommended unless you know exactly what you are doing.`,
    settingKey: "enable-embedding-interactive",
  };

  const methods = hasSimpleEmbedding
    ? [modularEmbedding, fullApp]
    : [guestEmbeds];

  return (
    <SettingsSection>
      <Stack gap="lg">
        {/* A heading over a single row says nothing the row does not. It earns
            its place only once the card is a list to choose from. */}
        {methods.length > 1 && (
          <Title order={4}>{t`Availability of embedding methods`}</Title>
        )}

        {methods.map((method) => (
          <EmbeddingMethodRow key={method.settingKey} {...method} />
        ))}
      </Stack>
    </SettingsSection>
  );
}

function EmbeddingMethodRow({
  title,
  description,
  settingKey,
  mergedSettingKeys,
}: EmbeddingMethod) {
  return (
    <Flex gap="xl" justify="space-between" align="flex-start">
      <Box maw="38rem">
        <Text fw="bold" c="text-primary" mb="xs">
          {title}
        </Text>
        <Text c="text-secondary" lh="lg">
          {description}
        </Text>
      </Box>

      <EmbeddingToggle
        settingKey={settingKey}
        mergedSettingKeys={mergedSettingKeys}
      />
    </Flex>
  );
}

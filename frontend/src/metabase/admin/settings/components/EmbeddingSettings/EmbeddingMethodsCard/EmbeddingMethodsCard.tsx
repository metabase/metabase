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
};

/**
 * The embedding methods, as one card of rows rather than a card per method.
 *
 * Every method keeps its own toggle, one per backend setting. The design shows
 * a single "Modular embedding and SDK for React" switch that also folds in
 * guest embeds, but that merge is unconfirmed and is sequenced separately: it
 * decides what a merged switch reads on an instance already in a mixed state,
 * and which of two consent moments survives.
 *
 * Guest embeds is the only free method. Modular embedding, the SDK and
 * full-app all need `embedding_simple`: the client only registers the modular
 * runtime when the token has it, so showing their toggles below the paywall
 * offers switches that turn nothing on. The settings themselves carry no
 * `:feature`, so nothing server-side stops an OSS admin writing them — see the
 * note in the tech doc.
 */
export function EmbeddingMethodsCard() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  const paidMethods: EmbeddingMethod[] = [
    {
      title: t`Modular embedding`,
      description: t`The simplest way to embed Metabase. Embed dashboards, questions, the query builder, natural language querying with AI, and more in your app with components.`,
      settingKey: "enable-embedding-simple",
    },
    {
      title: t`Modular embedding SDK`,
      description: t`Embed the full power of Metabase into your application to build a custom analytics experience and programmatically manage dashboards and data.`,
      settingKey: "enable-embedding-sdk",
    },
  ];

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
    ? [...paidMethods, guestEmbeds, fullApp]
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

      <EmbeddingToggle settingKey={settingKey} />
    </Flex>
  );
}

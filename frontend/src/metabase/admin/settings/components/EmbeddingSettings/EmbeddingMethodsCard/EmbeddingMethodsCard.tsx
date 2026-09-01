import type { ReactNode } from "react";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Box, Flex, Text } from "metabase/ui";
import { isNotNull } from "metabase/utils/types";

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
 * Modular embedding, the SDK and guest embeds share one switch, agreed for the
 * embedding settings reorganization and carried by EMB-2257: individual
 * toggles add complexity without adding security, since whoever can embed also
 * controls the toggles, and guest is a property of modular embedding rather
 * than a method beside it. Full-app keeps its own.
 *
 * `enable-embedding-modular` is the one setting behind that switch. Until an
 * admin sets it, it reads as the OR of the three deprecated settings it
 * replaces, so an upgrade cannot switch a live embed off.
 *
 * Guest embeds is the only free method, so OSS keeps a guest-only row.
 */
export function EmbeddingMethodsCard() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");
  const hasFullAppEmbedding = useHasTokenFeature("embedding");

  const modularEmbedding: EmbeddingMethod = {
    title: t`Modular embedding and SDK for React`,
    description: t`Embed the full power of Metabase into your application with modular embedding and the React SDK to build custom analytics experiences and programmatically manage dashboards and data.`,
    settingKey: "enable-embedding-modular",
  };

  const guestEmbeds: EmbeddingMethod = {
    title: t`Enable embedding`,
    description: t`Embed Metabase dashboards and questions into your application with modular embedding.`,
    settingKey: "enable-embedding-modular",
  };

  const fullAppEmbedding: EmbeddingMethod = {
    title: t`Full-app embedding`,
    description: t`A way to embed the entire Metabase app in an iframe. This involves hard trade-off and is generally not recommended unless you know exactly what you are doing.`,
    settingKey: "enable-embedding-interactive",
  };

  const proMethods = [
    hasSimpleEmbedding ? modularEmbedding : null,
    hasFullAppEmbedding ? fullAppEmbedding : null,
  ].filter(isNotNull);

  const methods = proMethods.length > 0 ? proMethods : [guestEmbeds];

  return (
    <SettingsSection
      title={methods.length > 1 ? t`Availability of embedding methods` : null}
      titleProps={{ order: 4 }}
    >
      {methods.map((method) => (
        <EmbeddingMethodRow key={method.settingKey} {...method} />
      ))}
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

      <EmbeddingToggle settingKey={settingKey} aria-label={`${title} toggle`} />
    </Flex>
  );
}

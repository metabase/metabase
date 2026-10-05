import type { ReactNode } from "react";
import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import {
  type EmbeddingSettingKey,
  EmbeddingToggle,
} from "metabase/embedding/settings/EmbeddingToggle";
import { SettingsSection } from "metabase/settings-components";
import { Box, Flex, Text } from "metabase/ui";
import { isNotNull } from "metabase/utils/types";

type EmbeddingMethod = {
  title: string;
  description: ReactNode;
  settingKey: EmbeddingSettingKey;
  requiresTerms: boolean;
};

/**
 * The embedding methods, as one card of rows rather than a card per method.
 *
 * Modular embedding and guest embeds share one switch, since guest is a
 * property of modular embedding rather than a method beside it. The React SDK
 * and full-app embedding each keep their own, so an instance's settings say
 * which methods it uses.
 *
 * `enable-embedding-modular` is the setting behind the shared switch. Until an
 * admin sets it, it reads as the OR of the two deprecated settings it
 * replaces, so an upgrade cannot switch a live embed off.
 *
 * Guest embeds is the only free method, so OSS keeps a guest-only row.
 *
 * Side-car embedding is a link to Metabase from the customer's app, not an
 * embed, so its switch only reports usage and is listed with the paid methods.
 */
export function EmbeddingMethodsCard() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");
  const hasSdkEmbedding = useHasTokenFeature("embedding_sdk");
  const hasFullAppEmbedding = useHasTokenFeature("embedding");

  const modularEmbedding: EmbeddingMethod = {
    title: t`Modular embedding`,
    description: t`Drop dashboards, charts, or the query builder into your app with a snippet of HTML. Works with any framework.`,
    settingKey: "enable-embedding-modular",
    requiresTerms: true,
  };

  const sdkEmbedding: EmbeddingMethod = {
    title: t`Modular embedding React SDK`,
    description: t`Embed the full power of Metabase into your application to build custom analytics experiences and programmatically manage dashboards and data.`,
    settingKey: "enable-embedding-sdk",
    requiresTerms: true,
  };

  const guestEmbeds: EmbeddingMethod = {
    title: t`Enable embedding`,
    description: t`Embed Metabase dashboards and questions into your application with modular embedding.`,
    settingKey: "enable-embedding-modular",
    requiresTerms: false,
  };

  const fullAppEmbedding: EmbeddingMethod = {
    title: t`Full-app embedding`,
    description: t`A way to embed the entire Metabase app in an iframe. This involves hard trade-off and is generally not recommended unless you know exactly what you are doing.`,
    settingKey: "enable-embedding-interactive",
    requiresTerms: false,
  };

  const sidecarEmbedding: EmbeddingMethod = {
    title: t`Standalone Metabase linked from your app`,
    description: t`Link to Metabase from your own app and provide authentication with SSO.`,
    settingKey: "enable-embedding-sidecar",
    requiresTerms: false,
  };

  const proMethods = [
    hasSimpleEmbedding ? modularEmbedding : null,
    hasSdkEmbedding ? sdkEmbedding : null,
    hasFullAppEmbedding ? fullAppEmbedding : null,
  ].filter(isNotNull);

  const methods =
    proMethods.length > 0 ? [...proMethods, sidecarEmbedding] : [guestEmbeds];

  return (
    <SettingsSection
      title={methods.length > 1 ? t`Enable embedding methods` : null}
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
  requiresTerms,
}: EmbeddingMethod) {
  return (
    <Flex gap="xxl" justify="space-between" align="flex-start">
      <Box maw="38rem">
        <Text fw="bold" c="text-primary" mb="xxs">
          {title}
        </Text>
        <Text c="text-secondary" lh="lg">
          {description}
        </Text>
      </Box>

      <EmbeddingToggle
        settingKey={settingKey}
        requiresTerms={requiresTerms}
        aria-label={`${title} toggle`}
      />
    </Flex>
  );
}

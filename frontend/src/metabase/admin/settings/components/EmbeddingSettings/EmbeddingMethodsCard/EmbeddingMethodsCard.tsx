import type { ReactNode } from "react";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Box, Flex, Text } from "metabase/ui";

import {
  type EmbeddingSettingKey,
  EmbeddingToggle,
} from "../EmbeddingToggle/EmbeddingToggle";

type EmbeddingMethod = {
  title: string;
  description: ReactNode;
  settingKey: EmbeddingSettingKey;
  /**
   * The other settings this row's switch writes, so one row can present
   * several embedding methods. Temporary: EMB-2257 gives the merged switch a
   * single setting to read and write, and deletes the fan-out with it.
   */
  mergedSettingKeys?: EmbeddingSettingKey[];
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
 * The merge is presentational for now -- the switch writes all three settings
 * and reads on when any is on, which is what the backend flag will do once
 * EMB-2257 replaces them with one.
 *
 * Guest embeds is the only free method, so OSS keeps a guest-only row.
 */
export function EmbeddingMethodsCard() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  const modularEmbedding: EmbeddingMethod = {
    title: t`Modular embedding and SDK for React`,
    description: t`Embed the full power of Metabase into your application with modular embedding and the React SDK to build custom analytics experiences and programmatically manage dashboards and data.`,
    settingKey: "enable-embedding-simple",
    mergedSettingKeys: ["enable-embedding-sdk", "enable-embedding-static"],
  };

  const guestEmbeds: EmbeddingMethod = {
    title: t`Enable embedding`,
    description: t`Embed Metabase dashboards and questions into your application with modular embedding.`,
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
        aria-label={`${title} toggle`}
      />
    </Flex>
  );
}

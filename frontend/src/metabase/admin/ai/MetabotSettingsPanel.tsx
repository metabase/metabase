import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { match } from "ts-pattern";
import { c, t } from "ttag";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import { canonicalCollectionId } from "metabase/common/collections/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import {
  LoadingSkeleton,
  TextSkeleton,
} from "metabase/common/components/Skeletons";
import { useToast } from "metabase/common/hooks";
import { useGetIcon } from "metabase/hooks/use-icon";
import { useUpdateMetabotMutation } from "metabase/metabot";
import { FIXED_METABOT_ENTITY_IDS } from "metabase/metabot/constants";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { useAdminSetting } from "metabase/settings";
import { SettingHeader } from "metabase/settings-components";
import {
  Box,
  Button,
  Flex,
  Icon,
  Loader,
  Skeleton,
  Stack,
  Switch,
  Text,
} from "metabase/ui";
import type {
  Collection,
  CollectionEssentials,
  EnterpriseSettingKey,
  MetabotInfo,
} from "metabase-types/api";

import { MetabotPromptSuggestionPane } from "./MetabotAdminSuggestedPrompts";

const BUTTON_HEIGHT = 32;

export function MetabotSettingsPanel({ metabot }: { metabot: MetabotInfo }) {
  const isEmbedMetabot =
    metabot.entity_id === FIXED_METABOT_ENTITY_IDS.EMBEDDED;

  const enabledSettingKey: EnterpriseSettingKey = isEmbedMetabot
    ? "embedded-metabot-enabled?"
    : "metabot-enabled?";

  return (
    <Stack gap="xl">
      {isEmbedMetabot && (
        <Text c="text-secondary" maw="40rem">
          {t`If you're embedding the Metabot component in an app, you can specify a different collection that embedded Metabot is allowed to use for creating queries.`}
        </Text>
      )}

      <MetabotEnabledToggle
        settingKey={enabledSettingKey}
        isEmbedMetabot={isEmbedMetabot}
      />

      <MetabotSettingsBody settingKey={enabledSettingKey}>
        <PLUGIN_MODERATION.MetabotVerifiedContentConfigurationPane
          metabot={metabot}
        />

        <MetabotCollectionConfigurationPane
          metabot={metabot}
          title={
            isEmbedMetabot
              ? undefined
              : t`Collection for natural language querying`
          }
        />

        <MetabotPromptSuggestionPane metabot={metabot} />
      </MetabotSettingsBody>
    </Stack>
  );
}

function MetabotEnabledToggle({
  settingKey,
  isEmbedMetabot = false,
}: {
  settingKey: EnterpriseSettingKey;
  isEmbedMetabot?: boolean;
}) {
  const { value, updateSetting, isLoading } = useAdminSetting(settingKey);

  const handleToggle = async (checked: boolean) => {
    await updateSetting({ key: settingKey, value: checked });
  };

  return (
    <Box>
      <SettingHeader
        id="enable-metabot"
        title={isEmbedMetabot ? t`Enable Embedded Metabot` : t`Enable Metabot`}
        description={
          isEmbedMetabot
            ? undefined
            : t`Metabot is Metabase's AI assistant. When enabled, Metabot will be available to help users create queries, analyze data, and answer questions about your data.`
        }
      />
      <Flex align="center" gap="lg" mt="lg">
        <Switch
          data-testid="metabot-enabled-toggle"
          checked={!!value}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={isLoading}
          w="auto"
        />
        <Text c={value ? "text-primary" : "text-secondary"} fw="500">
          {isEmbedMetabot
            ? value
              ? t`Embedded Metabot is enabled`
              : t`Embedded Metabot is disabled`
            : value
              ? t`Metabot is enabled`
              : t`Metabot is disabled`}
        </Text>
      </Flex>
    </Box>
  );
}

function MetabotSettingsBody({
  settingKey,
  children,
}: {
  settingKey: EnterpriseSettingKey;
  children: ReactNode;
}) {
  const { value } = useAdminSetting(settingKey);
  const isDisabled = value === false;

  if (isDisabled) {
    return null;
  }

  return <Stack gap="xl">{children}</Stack>;
}

function MetabotCollectionConfigurationPane({
  metabot,
  title,
}: {
  metabot: MetabotInfo;
  title?: string;
}) {
  const metabotId = metabot.id;
  const metabotName = metabot.name;

  const {
    data: collection,
    isLoading,
    error,
  } = useGetCollectionQuery({
    id: metabot.collection_id ?? "root",
  });

  const [updateMetabot, { isLoading: isUpdating }] = useUpdateMetabotMutation();
  const [isOpen, { open, close }] = useDisclosure(false);
  const [sendToast] = useToast();

  const defaultTitle = c("{0} is the name of an AI assistant")
    .t`Collection ${metabotName} can use`;

  if (isLoading) {
    return (
      <Box>
        <SettingHeader id="allow-metabot" title={title ?? defaultTitle} />
        <LoadingSkeleton gap={0}>
          <CollectionPaneSkeleton />
        </LoadingSkeleton>
      </Box>
    );
  }

  if (!collection || error) {
    return (
      <LoadingAndErrorWrapper
        error={error ? t`Error fetching Metabot configuration` : null}
      />
    );
  }

  const handleUpdateCollectionId = async (
    newEntity: Pick<MetabotInfo, "id" | "name">,
  ) => {
    close();
    const result = await updateMetabot({
      id: metabotId,
      collection_id: canonicalCollectionId(newEntity.id),
    });

    if (result.error) {
      sendToast({
        message: t`Error setting ${newEntity.name}`,
        variant: "negative",
      });
    }
  };

  return (
    <Box>
      <SettingHeader id="allow-metabot" title={title ?? defaultTitle} />
      <CollectionInfo collection={collection} />
      <Flex gap="lg" mt="lg">
        <Button onClick={open} leftSection={isUpdating && <Loader size="xs" />}>
          {match({ isMutating: isUpdating, collection })
            .with({ isMutating: true }, () => t`Updating collection...`)
            .with({ collection: undefined }, () => t`Pick a collection`)
            .otherwise(() => t`Pick a different collection`)}
        </Button>
      </Flex>
      {isOpen && (
        <CollectionPickerModal
          title={t`Select a collection`}
          value={{
            id: collection?.id ?? null,
            model: "collection",
          }}
          onChange={(item) =>
            // Unjustified type cast. FIXME
            handleUpdateCollectionId(item as Pick<MetabotInfo, "id" | "name">)
          }
          onClose={close}
          options={{
            hasRootCollection: true,
            hasPersonalCollections: false,
          }}
        />
      )}
    </Box>
  );
}

function CollectionInfo({ collection }: { collection: Collection }) {
  const { data: collectionInfo } = useGetCollectionQuery(
    collection?.id ? { id: collection.id } : skipToken,
  );

  if (!collection || !collectionInfo) {
    return null;
  }

  const parent = collectionInfo?.effective_ancestors?.slice(-1)?.[0];

  return (
    <Flex align="center" gap="sm" c="text-disabled" mb="sm">
      {parent && (
        <>
          <CollectionDisplay collection={parent} />
          <Text c="text-disabled" fw="bold">
            /
          </Text>
        </>
      )}
      <CollectionDisplay collection={collectionInfo} />
    </Flex>
  );
}

const CollectionDisplay = ({
  collection,
}: {
  collection: CollectionEssentials;
}) => {
  const getIcon = useGetIcon();
  const icon = getIcon({ model: "collection", ...collection });
  return (
    <Flex align="center" gap="sm">
      <Icon {...icon} c={icon.color ?? "core-brand"} />
      <Text c="text-secondary" fw="bold">
        {collection.name}
      </Text>
    </Flex>
  );
};

function CollectionPaneSkeleton() {
  return (
    <>
      <Flex align="center" gap="sm" h={20} mb="sm">
        <Skeleton h={16} w={16} radius="xs" />
        <Skeleton h={14} w={160} radius="xs" />
      </Flex>
      <Skeleton h={BUTTON_HEIGHT} w={200} mt="lg" radius="sm" />
    </>
  );
}

function SettingHeaderSkeleton({
  withDescription = false,
}: {
  withDescription?: boolean;
}) {
  return (
    <Stack gap="sm" mb="sm">
      <Skeleton h={14} w={200} radius="xs" />
      {withDescription && (
        <TextSkeleton lines={2} lineHeight={12} maw="38rem" />
      )}
    </Stack>
  );
}

/** Stands in for `MetabotSettingsPanel` while the metabot it configures loads. */
export function MetabotSettingsPanelSkeleton() {
  return (
    <Stack gap="xl">
      <Box>
        <SettingHeaderSkeleton withDescription />
        <Flex align="center" gap="lg" mt="lg">
          <Skeleton h={20} w={36} radius="xl" />
          <Skeleton h={14} w={140} radius="xs" />
        </Flex>
      </Box>
      <Box>
        <SettingHeaderSkeleton />
        <CollectionPaneSkeleton />
      </Box>
      <Box>
        <SettingHeaderSkeleton withDescription />
        <Skeleton h={BUTTON_HEIGHT} w={220} radius="sm" />
      </Box>
    </Stack>
  );
}

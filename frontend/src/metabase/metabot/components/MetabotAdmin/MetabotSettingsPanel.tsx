import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { match } from "ts-pattern";
import { c, t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import {
  skipToken,
  useGetCollectionQuery,
  useUpdateMetabotMutation,
} from "metabase/api";
import { useAdminSetting } from "metabase/api/utils/settings";
import { canonicalCollectionId } from "metabase/collections/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { useToast } from "metabase/common/hooks";
import { FIXED_METABOT_ENTITY_IDS } from "metabase/metabot/constants";
import { PLUGIN_MODERATION } from "metabase/plugins";
import {
  Box,
  Button,
  Flex,
  Icon,
  Loader,
  Stack,
  Switch,
  Text,
} from "metabase/ui";
import { getIcon } from "metabase/utils/icon";
import type {
  Collection,
  CollectionEssentials,
  EnterpriseSettingKey,
  MetabotInfo,
} from "metabase-types/api";

import { MetabotPromptSuggestionPane } from "./MetabotAdminSuggestedPrompts";

export function MetabotSettingsPanel({ metabot }: { metabot: MetabotInfo }) {
  const isEmbedMetabot =
    metabot.entity_id === FIXED_METABOT_ENTITY_IDS.EMBEDDED;

  const enabledSettingKey: EnterpriseSettingKey = isEmbedMetabot
    ? "embedded-metabot-enabled?"
    : "metabot-enabled?";

  return (
    <Stack gap="lg">
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
            : t`Metabot is Metabase's AI assistant. When enabled, Metabot will be available to help users create queries, analyze data, and answer questions about your data.` // eslint-disable-line metabase/no-literal-metabase-strings -- admin UI
        }
      />
      <Flex align="center" gap="md" mt="md">
        <Switch
          data-testid="metabot-enabled-toggle"
          checked={!!value}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={isLoading}
          w="auto"
          size="sm"
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

  return <Stack gap="lg">{children}</Stack>;
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

  if (isLoading || !collection || error) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoading}
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
        icon: "warning",
      });
    }
  };

  const defaultTitle = c("{0} is the name of an AI assistant")
    .t`Collection ${metabotName} can use`;

  return (
    <Box>
      <SettingHeader id="allow-metabot" title={title ?? defaultTitle} />
      <CollectionInfo collection={collection} />
      <Flex gap="md" mt="md">
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
    <Flex align="center" gap="sm" c="text-tertiary" mb="sm">
      {parent && (
        <>
          <CollectionDisplay collection={parent} />
          <Text c="text-tertiary" fw="bold">
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
  const icon = getIcon({ model: "collection", ...collection });
  return (
    <Flex align="center" gap="sm">
      <Icon {...icon} c={icon.color ?? "brand"} />
      <Text c="text-secondary" fw="bold">
        {collection.name}
      </Text>
    </Flex>
  );
};

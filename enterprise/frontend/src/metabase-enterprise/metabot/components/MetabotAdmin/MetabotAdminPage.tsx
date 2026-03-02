import { useDisclosure } from "@mantine/hooks";
import { useEffect, useMemo } from "react";
import { IndexRoute, Route } from "react-router";
import { push } from "react-router-redux";
import { P, match } from "ts-pattern";
import { c, jt, t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { skipToken, useGetCollectionQuery } from "metabase/api";
import { canonicalCollectionId } from "metabase/collections/utils";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { useToast } from "metabase/common/hooks";
import { getIcon } from "metabase/lib/icon";
import { useDispatch } from "metabase/lib/redux";
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
import {
  useListMetabotsQuery,
  useUpdateMetabotMutation,
} from "metabase-enterprise/api";
import {
  FIXED_METABOT_ENTITY_IDS,
  FIXED_METABOT_IDS,
} from "metabase-enterprise/metabot/constants";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type {
  Collection,
  CollectionEssentials,
  MetabotInfo,
} from "metabase-types/api";

import { MetabotPromptSuggestionPane } from "./MetabotAdminSuggestedPrompts";
import { useMetabotIdPath } from "./utils";

export function getAdminRoutes() {
  return [
    <IndexRoute key="index" component={MetabotAdminPage} />,
    <Route key="route" path=":metabotId" component={MetabotAdminPage} />,
  ];
}

export function MetabotAdminPage() {
  const metabotId = useMetabotIdPath() ?? FIXED_METABOT_IDS.DEFAULT;
  const { data, isLoading, error } = useListMetabotsQuery();

  const metabot = data?.items?.find((bot) => bot.id === metabotId);

  if (isLoading || !metabot) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoading || !data}
        error={match({ isLoading, error, metabot })
          .with(
            { isLoading: false, error: P.not(null) },
            () => t`Error fetching Metabots`,
          )
          .with({ isLoading: false, metabot: undefined }, () => t`Not found.`)
          .otherwise(() => null)}
      />
    );
  }

  const isEmbedMetabot =
    metabot.entity_id === FIXED_METABOT_ENTITY_IDS.EMBEDDED;

  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
      <ErrorBoundary>
        <SettingsSection key={metabotId}>
          <Box>
            <SettingHeader
              id="configure-metabot"
              title={c("{0} is the name of an AI assistant")
                .t`Configure ${metabot.name}`}
              description={c("{0} is the name of an AI assistant") // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin ui
                .t`${metabot.name} is Metabase's AI agent. To help ${metabot.name} more easily find and focus on the data you care about most, configure what content it should be able to access or use to create queries.`}
            />
            {isEmbedMetabot && (
              <Text c="text-secondary" maw="40rem">
                {t`If you're embedding the Metabot component in an app, you can specify a different collection that embedded Metabot is allowed to use for creating queries.`}
              </Text>
            )}
          </Box>

          <MetabotVerifiedContentConfigurationPane metabot={metabot} />

          <MetabotCollectionConfigurationPane
            metabot={metabot}
            title={
              isEmbedMetabot
                ? undefined
                : t`Collection for natural language querying`
            }
          />

          <MetabotPromptSuggestionPane metabot={metabot} />
        </SettingsSection>
      </ErrorBoundary>
    </AdminSettingsLayout>
  );
}

function MetabotNavPane() {
  const { data, isLoading } = useListMetabotsQuery();
  const metabotId = useMetabotIdPath();
  const dispatch = useDispatch();

  const metabots = useMemo(() => _.sortBy(data?.items ?? [], "id"), [data]);

  useEffect(() => {
    const hasMetabotId = metabots?.some((metabot) => metabot.id === metabotId);

    if (!hasMetabotId && metabots?.length) {
      dispatch(push(`/admin/metabot/${metabots[0]?.id}`));
    }
  }, [metabots, metabotId, dispatch]);

  if (isLoading || !data) {
    return null;
  }

  return (
    <Flex direction="column" flex="0 0 auto">
      <AdminNavWrapper>
        {metabots?.map((metabot) => (
          <AdminNavItem
            key={metabot.id}
            icon="metabot"
            label={metabot.name}
            path={`/admin/metabot/${metabot.id}`}
          />
        ))}
      </AdminNavWrapper>
    </Flex>
  );
}

function MetabotVerifiedContentConfigurationPane({
  metabot,
}: {
  metabot: MetabotInfo;
}) {
  const [updateMetabot, { isLoading: isUpdating }] = useUpdateMetabotMutation();
  const [sendToast] = useToast();

  const handleVerifiedContentToggle = async (checked: boolean) => {
    const result = await updateMetabot({
      id: metabot.id,
      use_verified_content: checked,
    });

    if (result.error) {
      sendToast({
        message: t`Error updating Metabot`,
        icon: "warning",
      });
    }
  };

  if (!hasPremiumFeature("content_verification")) {
    return null;
  }

  return (
    <Stack gap="sm">
      <SettingHeader
        id="verified-content"
        title={t`Verified content`}
        description={jt`When enabled, Metabot will only use models and metrics marked as Verified.`}
      />
      <Switch
        label={t`Only use Verified content`}
        checked={!!metabot.use_verified_content}
        onChange={(e) => handleVerifiedContentToggle(e.target.checked)}
        disabled={isUpdating}
        w="auto"
        size="sm"
      />
    </Stack>
  );
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

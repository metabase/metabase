import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { match } from "ts-pattern";
import { c, jt, t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { skipToken, useGetCollectionQuery } from "metabase/api";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { useToast } from "metabase/common/hooks";
import { color } from "metabase/lib/colors";
import { getIcon } from "metabase/lib/icon";
import { Alert, Box, Button, Flex, Icon, Loader, Text } from "metabase/ui";
import {
  useDeleteMetabotEntitiesMutation,
  useListMetabotsEntitiesQuery,
  useListMetabotsQuery,
  useUpdateMetabotEntitiesMutation,
} from "metabase-enterprise/api";
import { useMetabotEnabled } from "metabase-enterprise/metabot/hooks";
import type {
  CollectionEssentials,
  MetabotEntity,
  MetabotId,
} from "metabase-types/api";

import { MetabotPromptSuggestionPane } from "./MetabotAdminSuggestedPrompts";
import { MetabotNavPane } from "./MetabotNavPane";
import { useMetabotIdPath } from "./utils";

export function MetabotAgentSettingsPage() {
  const metabotId = useMetabotIdPath();
  const { data, isLoading, error } = useListMetabotsQuery();
  const metabotName =
    data?.items?.find((bot) => bot.id === metabotId)?.name ?? t`Metabot`;
  const isEmbeddedMetabot = metabotName.toLowerCase().includes("embed");
  const isMetabotEnabled = useMetabotEnabled();

  const { data: entityList } = useListMetabotsEntitiesQuery(
    metabotId ? { id: metabotId } : skipToken,
  );
  const hasEntities = (entityList?.items?.length ?? 0) > 0;

  if (isLoading || !data) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={error ? t`Error fetching Metabots` : null}
      />
    );
  }

  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
      <ErrorBoundary>
        <SettingsSection>
          {!isMetabotEnabled && (
            <Alert color="warning" icon={<Icon name="info" />}>
              <Text>
                {jt`Metabot is disabled, but you can enable it on the ${(
                  <Text component={Link} c="brand" to="/admin/metabot/general">
                    {t`General Metabot Settings`}
                  </Text>
                )} page.`}
              </Text>
            </Alert>
          )}
          <Box>
            <SettingHeader
              id="configure-metabot"
              title={c("{0} is the name of an AI assistant")
                .t`Configure ${metabotName}`}
              description={c("{0} is the name of an AI assistant") // eslint-disable-next-line no-literal-metabase-strings -- admin ui
                .t`${metabotName} is Metabase's AI agent. To help ${metabotName} more easily find and focus on the data you care about most, select the collection containing the models and metrics it should be able to use to create queries.`}
            />
            {isEmbeddedMetabot && (
              <Text c="text-medium" maw="40rem">
                {t`If you're embedding the Metabot component in an app, you can specify a different collection that embedded Metabot is allowed to use for creating queries.`}
              </Text>
            )}
          </Box>
          {metabotId && (
            <>
              <MetabotConfigurationPane
                metabotId={metabotId}
                metabotName={metabotName}
              />
              {hasEntities && (
                <MetabotPromptSuggestionPane
                  key={metabotId}
                  metabotId={metabotId}
                />
              )}
            </>
          )}
        </SettingsSection>
      </ErrorBoundary>
    </AdminSettingsLayout>
  );
}

function MetabotConfigurationPane({
  metabotId,
  metabotName,
}: {
  metabotId: MetabotId;
  metabotName: string;
}) {
  const {
    data: entityList,
    isLoading,
    error,
  } = useListMetabotsEntitiesQuery({ id: metabotId });
  const [updateEntities, { isLoading: isUpdating }] =
    useUpdateMetabotEntitiesMutation();
  const [deleteEntity, { isLoading: isDeleting }] =
    useDeleteMetabotEntitiesMutation();
  const isMutating = isUpdating || isDeleting;
  const [isOpen, { open, close }] = useDisclosure(false);
  const [sendToast] = useToast();

  if (isLoading || !entityList || error) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={error ? t`Error fetching Metabot configuration` : null}
      />
    );
  }

  const collection: MetabotEntity | undefined = entityList?.items?.[0];
  const handleDelete = async () => {
    if (collection) {
      const result = await deleteEntity({
        metabotId,
        entityModel: "collection",
        entityId: collection.id,
      });

      if (result.error) {
        sendToast({
          message: t`Error removing folder`,
          icon: "warning",
        });
      }
    }
  };

  const handleAddEntity = async (
    newEntity: Pick<MetabotEntity, "model" | "id" | "name">,
  ) => {
    close();
    await handleDelete();
    const result = await updateEntities({
      id: metabotId,
      entities: [_.pick(newEntity, "model", "id")],
    });

    if (result.error) {
      sendToast({
        message: t`Error adding ${newEntity.name}`,
        icon: "warning",
      });
    }
  };

  return (
    <Box>
      <SettingHeader
        id="allow-metabot"
        title={c("{0} is the name of an AI assistant")
          .t`Collection ${metabotName} can use`}
      />
      <CollectionInfo collection={collection} />
      <Flex gap="md" mt="md">
        <Button onClick={open} leftSection={isMutating && <Loader size="xs" />}>
          {match({ isMutating, collection })
            .with({ isMutating: true }, () => t`Updating collection...`)
            .with({ collection: undefined }, () => t`Pick a collection`)
            .otherwise(() => t`Pick a different collection`)}
        </Button>
        {collection && (
          <Button onClick={handleDelete}>
            <Icon name="trash" />
          </Button>
        )}
      </Flex>
      {isOpen && (
        <CollectionPickerModal
          title={t`Select a collection`}
          shouldDisableItem={(item) => item.id === "root"}
          canSelectItem={(item) => item && item.id !== "root"}
          value={{
            id: collection?.id ?? null,
            model: "collection",
          }}
          onChange={(item) =>
            handleAddEntity(
              item as unknown as Pick<MetabotEntity, "model" | "id" | "name">,
            )
          }
          onClose={close}
          options={{
            showRootCollection: true,
            showPersonalCollections: false,
          }}
        />
      )}
    </Box>
  );
}

function CollectionInfo({ collection }: { collection: MetabotEntity | null }) {
  const { data: collectionInfo } = useGetCollectionQuery(
    collection?.id ? { id: collection.id } : skipToken,
  );

  if (!collection || !collectionInfo) {
    return null;
  }

  const parent = collectionInfo?.effective_ancestors?.slice(-1)?.[0];

  return (
    <Flex align="center" gap="sm" c="text-light" mb="sm">
      {parent && (
        <>
          <CollectionDisplay collection={parent} />
          <Text c="text-light" fw="bold">
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
      <Icon {...icon} color={color(icon.color ?? "brand")} />
      <Text c="text-medium" fw="bold">
        {collection.name}
      </Text>
    </Flex>
  );
};

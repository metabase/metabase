import { useDisclosure } from "@mantine/hooks";
import { useEffect, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { skipToken, useGetCollectionQuery } from "metabase/api";
import { CollectionPickerModal } from "metabase/common/components/CollectionPicker";
import { useToast } from "metabase/common/hooks";
import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { color } from "metabase/lib/colors";
import { getIcon } from "metabase/lib/icon";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Flex, Icon, Stack, Text } from "metabase/ui";
import {
  useDeleteMetabotEntitiesMutation,
  useListMetabotsEntitiesQuery,
  useListMetabotsQuery,
  useUpdateMetabotEntitiesMutation,
} from "metabase-enterprise/api";
import type {
  CollectionEssentials,
  MetabotEntity,
  MetabotId,
} from "metabase-types/api";

import { useMetabotIdPath } from "./utils";

export function MetabotAdminPage() {
  const metabotId = useMetabotIdPath();
  return (
    <ErrorBoundary>
      <Flex p="xl">
        <MetabotNavPane />
        <Stack px="xl">
          <SettingHeader
            id="configure-metabot"
            title={t`Configure Metabot`}
            // eslint-disable-next-line no-literal-metabase-strings -- admin settings
            description={t`Metabot is Metabase's AI agent. To help Metabot more easily find and focus on the data you care about most, select the collection containing the models and metrics it should be able to use to create queries.`}
          />
          <MetabotConfigurationPane metabotId={metabotId} />
        </Stack>
      </Flex>
    </ErrorBoundary>
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
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <Flex direction="column" w="266px" flex="0 0 auto">
      <LeftNavPane>
        {metabots?.map((metabot) => (
          <LeftNavPaneItem
            key={metabot.id}
            name={metabot.name}
            path={`/admin/metabot/${metabot.id}`}
          />
        ))}
      </LeftNavPane>
    </Flex>
  );
}

function MetabotConfigurationPane({
  metabotId,
}: {
  metabotId: MetabotId | null;
}) {
  const { data: entityList, isLoading } = useListMetabotsEntitiesQuery(
    metabotId ?? skipToken,
  );
  const [updateEntities] = useUpdateMetabotEntitiesMutation();
  const [deleteEntity] = useDeleteMetabotEntitiesMutation();
  const [isOpen, { open, close }] = useDisclosure(false);
  const [sendToast] = useToast();

  if (!metabotId) {
    return null;
  }
  if (isLoading || !entityList) {
    return <LoadingAndErrorWrapper loading />;
  }

  const collection = entityList?.items?.[0];
  const handleDelete = async () => {
    if (collection) {
      await deleteEntity({
        metabotId,
        entityModel: "collection",
        entityId: collection.id,
      });
    }
  };

  const handleAddEntity = async (
    newEntity: Pick<MetabotEntity, "model" | "id" | "name">,
  ) => {
    handleDelete();
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
    close();
  };

  return (
    <Box>
      <SettingHeader id="allow-metabot" title={t`Collection Metabot can use`} />
      <CollectionInfo collection={collection} />
      <Flex gap="md" mt="md">
        <Button onClick={open}>
          {collection ? t`Pick a different collection` : t`Pick a collection`}
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

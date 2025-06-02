import { useDisclosure } from "@mantine/hooks";
import { useEffect, useMemo } from "react";
import { push } from "react-router-redux";
import { c, t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { skipToken, useGetCollectionQuery } from "metabase/api";
import { CollectionPickerModal } from "metabase/common/components/CollectionPicker";
import { Table } from "metabase/common/components/Table";
import { useToast } from "metabase/common/hooks";
import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/components/PaginationControls";
import { usePagination } from "metabase/hooks/use-pagination";
import { color } from "metabase/lib/colors";
import { getIcon } from "metabase/lib/icon";
import { useDispatch } from "metabase/lib/redux";
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Checkbox,
  Flex,
  Icon,
  Stack,
  Text,
} from "metabase/ui";
import {
  useDeleteMetabotEntitiesMutation,
  useDeleteSuggestedMetabotPromptMutation,
  useGetSuggestedMetabotPromptsQuery,
  useListMetabotsEntitiesQuery,
  useListMetabotsQuery,
  useUpdateMetabotEntitiesMutation,
  useUpdateSuggestedMetabotPromptMutation,
} from "metabase-enterprise/api";
import type {
  CollectionEssentials,
  MetabotEntity,
  MetabotId,
  SuggestedMetabotPrompt,
} from "metabase-types/api";

import { useMetabotIdPath } from "./utils";

export function MetabotAdminPage() {
  const metabotId = useMetabotIdPath();
  const { data, isLoading, error } = useListMetabotsQuery();
  const metabotName =
    data?.items?.find((bot) => bot.id === metabotId)?.name ?? t`Metabot`;
  const isEmbeddedMetabot = metabotName.toLowerCase().includes("embed");

  if (isLoading || !data) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={error ? t`Error fetching Metabots` : null}
      />
    );
  }

  return (
    <ErrorBoundary>
      <Flex p="xl">
        <MetabotNavPane />
        <Stack w="100%" px="xl" gap="xl">
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
              <MetabotPromptSuggestionPane metabotId={metabotId} />
            </>
          )}
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
    return null;
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
  const [updateEntities] = useUpdateMetabotEntitiesMutation();
  const [deleteEntity] = useDeleteMetabotEntitiesMutation();
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

  const collection = entityList?.items?.[0];
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
    close();
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

const MetabotPromptSuggestionPane = ({
  metabotId,
}: {
  metabotId: MetabotId;
}) => {
  const pageSize = 6;
  const { handleNextPage, handlePreviousPage, page } = usePagination();
  const offset = page * pageSize;

  const { data, isLoading, error } = useGetSuggestedMetabotPromptsQuery({
    metabot_id: metabotId,
    limit: pageSize,
    include_disabled: true,
    offset,
  });
  const [updatePrompt] = useUpdateSuggestedMetabotPromptMutation();
  const [deletePrompt] = useDeleteSuggestedMetabotPromptMutation();
  // const [refreshPrompts] = useRefreshSuggestedMetabotPromptsMutation();

  const [sendToast] = useToast();

  const prompts = data?.prompts ?? [];
  const total = data?.total ?? 0;

  if (isLoading) {
    return <div>loading...</div>;
  }
  if (error) {
    return <div>error...</div>;
  }

  return (
    <Stack w="100%">
      <SettingHeader id="prompt-suggestions" title={t`Prompt suggestions`} />
      <Table<SuggestedMetabotPrompt>
        columns={[
          { name: "Prompt", key: "prompt", sortable: false },
          { name: "Model or metric", key: "model", sortable: false },
          { name: "", key: "trash", sortable: false },
        ]}
        rows={prompts}
        rowRenderer={(row) => (
          <SuggestedPromptRow
            row={row}
            onToggleEnabled={async (enabled) => {
              // TODO: success / failure handling
              const { error } = await updatePrompt({
                metabot_id: metabotId,
                prompt_id: row.id,
                enabled,
              });
              if (error) {
                sendToast({
                  message: enabled
                    ? t`Failed to enable prompt`
                    : t`Failed to disabled prompt`,
                  icon: "warning",
                });
              } else {
                sendToast({
                  message: enabled
                    ? t`Succesfully enabled prompt`
                    : t`Succesfully disabled prompt`,
                  icon: "check",
                });
              }
            }}
            onDelete={async () => {
              // TODO: success / failure handling
              const { error } = await deletePrompt({
                metabot_id: metabotId,
                prompt_id: row.id,
              });
              sendToast({
                message: error
                  ? t`Failed to delete prompt`
                  : t`Succesfully deleted prompt`,
                icon: error ? "warning" : "check",
              });
            }}
          />
        )}
        emptyBody={
          <Center my="lg" fw="bold" c="text-light">
            {t`No prompts found.`}
          </Center>
        }
      />
      <Flex align="center" justify="flex-end" w="100%">
        <PaginationControls
          page={page}
          pageSize={pageSize}
          itemsLength={prompts.length}
          total={total}
          showTotal
          onNextPage={handleNextPage}
          onPreviousPage={handlePreviousPage}
        />
      </Flex>
    </Stack>
  );
};

const SuggestedPromptRow = ({
  row,
  onToggleEnabled,
  onDelete,
}: {
  row: SuggestedMetabotPrompt;
  onToggleEnabled: (enabled: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
}) => {
  return (
    <tr>
      <td>
        <Flex gap="sm">
          <Checkbox
            checked={row.enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
          />
          {row.prompt}
        </Flex>
      </td>
      <td>
        {row.model} {row.model_id}
      </td>
      <td>
        <ActionIcon onClick={onDelete} h="sm">
          <Icon name="trash" size="1rem" />
        </ActionIcon>
      </td>
    </tr>
  );
};

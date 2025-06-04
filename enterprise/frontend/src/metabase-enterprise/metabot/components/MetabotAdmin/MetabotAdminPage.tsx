import { useDisclosure } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
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
  Flex,
  Icon,
  Loader,
  Skeleton,
  Stack,
  Text,
} from "metabase/ui";
import {
  useDeleteMetabotEntitiesMutation,
  useDeleteSuggestedMetabotPromptMutation,
  useGetSuggestedMetabotPromptsQuery,
  useListMetabotsEntitiesQuery,
  useListMetabotsQuery,
  useRefreshSuggestedMetabotPromptsMutation,
  useUpdateMetabotEntitiesMutation,
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
              {hasEntities && (
                <MetabotPromptSuggestionPane metabotId={metabotId} />
              )}
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
  const [sendToast] = useToast();

  const { handleNextPage, handlePreviousPage, page, setPage } = usePagination();
  const pageSize = 2;
  const offset = page * pageSize;

  const { data, isFetching, error } = useGetSuggestedMetabotPromptsQuery({
    metabot_id: metabotId,
    limit: pageSize,
    offset,
  });

  const [deletePrompt] = useDeleteSuggestedMetabotPromptMutation();

  const [refreshPrompts, { isLoading: isRefreshing }] =
    useRefreshSuggestedMetabotPromptsMutation();

  const [isSlowRefresh, setIsSlowRefresh] = useState(false);
  useEffect(() => {
    if (isRefreshing) {
      const timeout = setTimeout(() => {
        setIsSlowRefresh(true);
      }, 5 * 1000);
      return () => clearTimeout(timeout);
    } else {
      setIsSlowRefresh(false);
    }
  }, [isRefreshing]);

  const handleRefreshPrompts = async () => {
    const { error } = await refreshPrompts(metabotId);
    if (error) {
      sendToast({
        message: t`Error refreshing prompts`,
        icon: "warning",
      });
    } else {
      setPage(0);
    }
  };

  const prompts = useMemo(() => data?.prompts ?? [], [data?.prompts]);
  const total = data?.total ?? 0;

  const rows = useMemo(() => {
    return isFetching
      ? new Array(pageSize).fill(null).map((_, id) => ({ id, isLoading: true }))
      : prompts;
  }, [isFetching, pageSize, prompts]);

  if (error) {
    return <div>error...</div>;
  }

  return (
    <Box w="100%">
      <SettingHeader
        id="prompt-suggestions"
        title={t`Prompt suggestions`}
        description={t`When users open a new Metabot chat, we’ll randomly show them a few suggested prompts based on the models and metrics in the collection you chose.`}
      />
      <Flex gap="md" align="center">
        <Button
          disabled={isRefreshing}
          leftSection={isRefreshing && <Loader size="xs" />}
          onClick={handleRefreshPrompts}
        >
          {isRefreshing
            ? t`Refreshing prompts suggestions...`
            : t`Refresh prompts suggestions`}
        </Button>
        {isSlowRefresh && (
          <Text c="text-light">{t`Hang tight, this can take a while...`}</Text>
        )}
      </Flex>
      <Box
        component={
          Table<
            | (SuggestedMetabotPrompt & { isLoading?: void })
            | { id: number; isLoading: boolean }
          >
        }
        maw="80rem"
        cols={
          <>
            <col width="60%" />
            <col width="40%" />
            <col width="3rem" />
          </>
        }
        columns={[
          { name: "Prompt", key: "prompt", sortable: false },
          { name: "Model or metric", key: "model", sortable: false },
          { name: "", key: "trash", sortable: false },
        ]}
        rows={rows}
        rowRenderer={(row) =>
          row.isLoading ? (
            <SkeletonSuggestedPromptRow key={row.id} />
          ) : (
            <SuggestedPromptRow
              key={row.id}
              row={row as SuggestedMetabotPrompt}
              onDelete={async () => {
                const { error } = await deletePrompt({
                  metabot_id: metabotId,
                  prompt_id: row.id,
                });
                sendToast(
                  error
                    ? { message: t`Failed to delete prompt`, icon: "warning" }
                    : { message: t`Succesfully deleted prompt`, icon: "check" },
                );
              }}
            />
          )
        }
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
    </Box>
  );
};

const SkeletonSuggestedPromptRow = () => (
  <Box component="tr" h="3.5rem">
    <td>
      <Skeleton h="1rem" natural />
    </td>
    <td>
      <Skeleton h="1rem" natural />
    </td>
    <Flex h="3.5rem" component="td" align="center" justify="flex-end">
      <Skeleton w="1.25rem" h="1rem" mr=".25rem" />
    </Flex>
  </Box>
);

const SuggestedPromptRow = ({
  row,
  onDelete,
}: {
  row: SuggestedMetabotPrompt;
  onDelete: () => Promise<void>;
}) => (
  <Box component="tr" mih="3.5rem">
    <Box component="td" py="1rem">
      <Flex gap="sm">{row.prompt}</Flex>
    </Box>
    <td>
      <Flex align="center" gap="sm">
        <Icon name={row.model} c="text-medium" /> {row.model_id}
      </Flex>
    </td>
    <Box component="td" h="3.5rem">
      <ActionIcon onClick={onDelete} h="sm">
        <Icon name="trash" size="1rem" />
      </ActionIcon>
    </Box>
  </Box>
);

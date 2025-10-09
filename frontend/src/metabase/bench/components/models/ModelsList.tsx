import type { Location } from "history";
import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router";
import { push, replace } from "react-router-redux";
import { t } from "ttag";

import { searchApi, useListCollectionsTreeQuery } from "metabase/api";
import { TAG_TYPE_MAPPING, listTag } from "metabase/api/tags";
import { getIcon } from "metabase/browse/models/utils";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { Tree } from "metabase/common/components/tree/Tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useFetchModels } from "metabase/common/hooks/use-fetch-models";
import {
  type CollectionTreeItem,
  buildCollectionTree,
} from "metabase/entities/collections/utils";
import { useDispatch, useSelector } from "metabase/lib/redux/hooks";
import { QueryBuilder } from "metabase/query_builder/containers/QueryBuilder";
import { getQuestion } from "metabase/query_builder/selectors";
import {
  Box,
  Center,
  FixedSizeIcon,
  Flex,
  Loader,
  NavLink,
  Text,
} from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type {
  Collection,
  RecentCollectionItem,
  SearchResult,
} from "metabase-types/api";

import { BenchLayout } from "../BenchLayout";
import { BenchPaneHeader } from "../BenchPaneHeader";
import { ItemsListSection } from "../ItemsListSection/ItemsListSection";
import { ItemsListTreeNode } from "../ItemsListSection/ItemsListTreeNode";
import type { BenchItemsListSorting } from "../ItemsListSection/types";

import { CreateModelMenu } from "./CreateModelMenu";

function buildNestedCollectionsAndModels(
  collections: Collection[],
  models: SearchResult[],
): ITreeNodeItem[] {
  const collectionTree = buildCollectionTree(collections);

  function hasModelsInDescendants(collection: CollectionTreeItem): boolean {
    const modelsInCollection = models.filter(
      (model) => model.collection.id === collection.id,
    );

    if (modelsInCollection.length > 0) {
      return true;
    }

    if (collection.children && collection.children.length > 0) {
      return collection.children.some(hasModelsInDescendants);
    }

    return false;
  }

  function convertCollectionToTreeNode(
    collection: CollectionTreeItem,
  ): ITreeNodeItem | null {
    if (!hasModelsInDescendants(collection)) {
      return null;
    }

    const modelsInCollection = models.filter(
      (model) => model.collection.id === collection.id,
    );

    const modelNodes: ITreeNodeItem[] = modelsInCollection.map((model) => {
      return {
        id: model.id,
        name: model.name,
        icon: getIcon({ type: "dataset", ...model }),
      };
    });

    const childCollectionNodes = (collection.children || [])
      .map(convertCollectionToTreeNode)
      .filter(
        (node: ITreeNodeItem | null): node is ITreeNodeItem => node !== null,
      );

    return {
      id: `collection-${collection.id}`,
      name: collection.name,
      icon: collection.icon || "folder",
      children: [...childCollectionNodes, ...modelNodes],
    };
  }

  return [
    ...collectionTree
      .map(convertCollectionToTreeNode)
      .filter(
        (node: ITreeNodeItem | null): node is ITreeNodeItem => node !== null,
      ),
    ...models
      .filter((m) => !m.collection.id)
      .map((m) => ({
        id: m.id,
        name: m.name,
        icon: getIcon({ type: "dataset", ...m }),
      })),
  ];
}

function ModelsList({
  activeId,
  onCollapse,
}: {
  activeId: number;
  onCollapse: () => void;
}) {
  const dispatch = useDispatch();
  const { isLoading: isLoadingModels, data: modelsData } = useFetchModels({
    filter_items_in_personal_collection: undefined, // include all models
  });
  const { isLoading: isLoadingCollections, data: collections } =
    useListCollectionsTreeQuery({ "exclude-archived": true });

  const models = modelsData?.data;
  const isLoading = isLoadingModels || isLoadingCollections;

  const treeData = useMemo(() => {
    return models && collections
      ? buildNestedCollectionsAndModels(collections, models)
      : [];
  }, [collections, models]);

  const handleModelSelect = (item: ITreeNodeItem) => {
    if (typeof item.id === "number") {
      dispatch(push(`/bench/model/${item.id}`));
    }
  };

  const [sorting, setSorting] = useState<BenchItemsListSorting>("collection");

  return (
    <ItemsListSection
      sectionTitle={t`Models`}
      titleMenuItems={null}
      sorting={sorting}
      onChangeSorting={setSorting}
      AddButton={CreateModelMenu}
      onCollapse={onCollapse}
      onAddNewItem={() => {}}
      listItems={
        !models || isLoading ? (
          <Center>
            <Loader />
          </Center>
        ) : sorting === "collection" ? (
          <Box mx="-md">
            <Tree
              data={treeData}
              selectedId={activeId}
              onSelect={handleModelSelect}
              emptyState={<Text c="text-light">{t`No models found`}</Text>}
              TreeNode={ItemsListTreeNode}
            />
          </Box>
        ) : (
          models.map((model) => (
            <ModelListItem
              key={model.id}
              model={model}
              active={model.id === activeId}
            />
          ))
        )
      }
    />
  );
}

function ModelListItem({
  model,
  active,
}: {
  model: RecentCollectionItem;
  active?: boolean;
}) {
  const icon = getIcon({ type: "dataset", ...model });
  return (
    <Box mb="sm">
      <NavLink
        component={Link}
        to={`/bench/model/${model.id}`}
        active={active}
        label={
          <>
            <Flex gap="sm" align="center">
              <FixedSizeIcon {...icon} size={16} c="brand" />
              <Text fw="bold" c={active ? "brand" : undefined}>
                {model.name}
              </Text>
            </Flex>
            <Flex gap="sm" c="text-light" ml="lg">
              <FixedSizeIcon name="folder" />
              <EllipsifiedCollectionPath collection={model.collection} />
            </Flex>
          </>
        }
      />
    </Box>
  );
}

export const ModelsLayout = ({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) => {
  return (
    <BenchLayout nav={<ModelsList activeId={+params.slug} />} name="model">
      {children}
    </BenchLayout>
  );
};

const ModelEditorHeader = ({ buttons }: { buttons?: ReactNode }) => {
  const question = useSelector(getQuestion);
  if (!question) {
    return null;
  }
  return (
    <BenchPaneHeader
      title={question.displayName() ?? t`New model`}
      actions={buttons}
    />
  );
};

export const ModelEditor = (props: {
  location: Location;
  params: { slug: string };
}) => {
  const dispatch = useDispatch();

  return (
    <QueryBuilder
      {...props}
      Header={ModelEditorHeader}
      preventCancel
      onCreateSuccess={(q: Question) => {
        dispatch(replace(`/bench/model/${q.id()}`));
        dispatch(
          searchApi.util.invalidateTags([listTag(TAG_TYPE_MAPPING["dataset"])]),
        );
      }}
    />
  );
};

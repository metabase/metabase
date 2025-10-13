import type { Location } from "history";
import { type ReactNode, useMemo } from "react";
import { Link } from "react-router";
import { push, replace } from "react-router-redux";
import { t } from "ttag";

import { searchApi, useListCollectionsTreeQuery } from "metabase/api";
import { TAG_TYPE_MAPPING, listTag } from "metabase/api/tags";
import { getTreeItems } from "metabase/bench/components/models/utils";
import { getIcon } from "metabase/browse/models/utils";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { Tree } from "metabase/common/components/tree/Tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useFetchModels } from "metabase/common/hooks/use-fetch-models";
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
import type { RecentCollectionItem } from "metabase-types/api";

import { BenchLayout } from "../BenchLayout";
import { BenchPaneHeader } from "../BenchPaneHeader";
import { ItemsListSection } from "../ItemsListSection/ItemsListSection";
import { ItemsListSettings } from "../ItemsListSection/ItemsListSettings";
import { ItemsListTreeNode } from "../ItemsListSection/ItemsListTreeNode";
import { useItemsListQuery } from "../ItemsListSection/useItemsListQuery";

import { CreateModelMenu } from "./CreateModelMenu";

function ModelsList({
  activeId,
  onCollapse,
  location,
}: {
  activeId: number;
  onCollapse: () => void;
  location: Location;
}) {
  const dispatch = useDispatch();
  const { isLoading: isLoadingModels, data: modelsData } = useFetchModels({
    filter_items_in_personal_collection: undefined, // include all models
  });
  const { isLoading: isLoadingCollections, data: collections } =
    useListCollectionsTreeQuery({ "exclude-archived": true });

  const models = modelsData?.data;
  const isLoading = isLoadingModels || isLoadingCollections;

  const listSettingsProps = useItemsListQuery({
    settings: [
      {
        name: "display",
        options: [
          {
            label: t`By collection`,
            value: "collection",
          },
          {
            label: t`Alphabetical`,
            value: "alphabetical",
          },
        ],
      },
    ],
    defaults: { display: "collection" },
    location,
  });

  const treeData = useMemo(() => {
    return models && collections
      ? getTreeItems(collections, models, "dataset")
      : [];
  }, [collections, models]);

  const handleModelSelect = (item: ITreeNodeItem) => {
    if (typeof item.id === "number") {
      dispatch(push(`/bench/model/${item.id}`));
    }
  };

  return (
    <ItemsListSection
      sectionTitle={t`Models`}
      AddButton={CreateModelMenu}
      settings={<ItemsListSettings {...listSettingsProps} />}
      onCollapse={onCollapse}
      onAddNewItem={() => {}}
      listItems={
        !models || isLoading ? (
          <Center>
            <Loader />
          </Center>
        ) : listSettingsProps.values.display === "collection" ? (
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
  location,
}: {
  children: React.ReactNode;
  params: { slug: string };
  location: Location;
}) => {
  return (
    <BenchLayout
      nav={<ModelsList activeId={+params.slug} location={location} />}
      name="model"
    >
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

import type { Location } from "history";
import { type ReactNode, useMemo } from "react";
import { Link } from "react-router";
import { push, replace } from "react-router-redux";
import { useLocalStorage } from "react-use";
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
import { getUser } from "metabase/selectors/user";
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
import type { SearchResult } from "metabase-types/api";

import { BenchLayout } from "../BenchLayout";
import { BenchPaneHeader } from "../BenchPaneHeader";
import { ItemsListSection } from "../ItemsListSection/ItemsListSection";
import { ItemsListSettings } from "../ItemsListSection/ItemsListSettings";
import { ItemsListTreeNode } from "../ItemsListSection/ItemsListTreeNode";

import { CreateModelMenu } from "./CreateModelMenu";

function ModelsList({
  activeId,
  onCollapse,
}: {
  activeId: number;
  onCollapse?: () => void;
}) {
  const dispatch = useDispatch();
  const { isLoading: isLoadingModels, data: modelsData } = useFetchModels({
    filter_items_in_personal_collection: undefined, // include all models
  });
  const { isLoading: isLoadingCollections, data: collections } =
    useListCollectionsTreeQuery({ "exclude-archived": true });

  const models = useMemo(
    () =>
      modelsData?.data
        ? [...modelsData.data].sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [modelsData],
  );
  const isLoading = isLoadingModels || isLoadingCollections;

  const [display = "tree", setDisplay] = useLocalStorage<
    "tree" | "alphabetical"
  >("metabase-bench-models-display");
  const currentUser = useSelector(getUser);
  const treeData = useMemo(() => {
    return display === "tree" && models && collections && currentUser
      ? getTreeItems(collections, models, "dataset", currentUser.id)
      : [];
  }, [collections, currentUser, display, models]);

  const handleModelSelect = (item: ITreeNodeItem) => {
    if (typeof item.id === "number") {
      dispatch(push(`/bench/model/${item.id}`));
    }
  };

  return (
    <ItemsListSection
      sectionTitle={t`Models`}
      addButton={<CreateModelMenu />}
      settings={
        <ItemsListSettings
          values={{ display }}
          settings={[
            {
              name: "display",
              options: [
                {
                  label: t`By collection`,
                  value: "tree",
                },
                {
                  label: t`Alphabetical`,
                  value: "alphabetical",
                },
              ],
            },
          ]}
          onSettingChange={(updates) =>
            updates.display && setDisplay(updates.display)
          }
        />
      }
      onCollapse={onCollapse}
      listItems={
        !models || isLoading ? (
          <Center>
            <Loader />
          </Center>
        ) : display === "tree" ? (
          <Box mx="-sm">
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
  model: SearchResult;
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

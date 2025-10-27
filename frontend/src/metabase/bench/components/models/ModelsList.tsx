import type { Location } from "history";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { withRouter } from "react-router";
import { push, replace } from "react-router-redux";
import { useLocalStorage } from "react-use";
import { t } from "ttag";

import {
  useGetCardQuery,
  useListCollectionsTreeQuery,
  useSearchQuery,
  useUpdateCardMutation,
} from "metabase/api";
import { getTreeItems } from "metabase/bench/components/models/utils";
import { BenchFlatListItem } from "metabase/bench/components/shared/BenchFlatListItem";
import { useItemsListFilter } from "metabase/bench/hooks/useItemsListFilter";
import { getIcon } from "metabase/browse/models/utils";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { SidesheetCard } from "metabase/common/components/Sidesheet/SidesheetCard";
import { ToolbarButton } from "metabase/common/components/ToolbarButton/ToolbarButton";
import { VirtualizedFlatList } from "metabase/common/components/VirtualizedFlatList";
import { VirtualizedTree } from "metabase/common/components/tree/VirtualizedTree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useFetchModels } from "metabase/common/hooks/use-fetch-models";
import { INJECT_RTK_QUERY_QUESTION_VALUE } from "metabase/entities/questions";
import { useDispatch, useSelector } from "metabase/lib/redux/hooks";
import { EmptyState } from "metabase/metadata/pages/DataModel/components/TablePicker/components/EmptyState";
import {
  API_UPDATE_QUESTION,
  updateQuestion,
} from "metabase/query_builder/actions";
import type { SidebarFeatures } from "metabase/query_builder/components/NativeQueryEditor/types";
import { ModelCacheManagementSection } from "metabase/query_builder/components/view/sidebars/ModelCacheManagementSection";
import { QuestionInfoSidebar } from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar/QuestionInfoSidebar";
import { shouldShowQuestionSettingsSidebar } from "metabase/query_builder/components/view/sidebars/QuestionSettingsSidebar";
import { QueryBuilder } from "metabase/query_builder/containers/QueryBuilder";
import { useSaveQuestion } from "metabase/query_builder/containers/use-save-question";
import { getQuestion } from "metabase/query_builder/selectors";
import { QUESTION_NAME_MAX_LENGTH } from "metabase/questions/constants";
import { getUser } from "metabase/selectors/user";
import {
  Box,
  Center,
  FixedSizeIcon,
  Flex,
  Icon,
  Input,
  Loader,
  Stack,
} from "metabase/ui";
import Question from "metabase-lib/v1/Question";
import type { SearchResult } from "metabase-types/api";

import { BenchLayout } from "../BenchLayout";
import { BenchPaneHeader } from "../BenchPaneHeader";
import { ItemsListSection } from "../ItemsListSection/ItemsListSection";
import { ItemsListSettings } from "../ItemsListSection/ItemsListSettings";
import { ItemsListTreeNode } from "../ItemsListSection/ItemsListTreeNode";
import { BenchNameInput } from "../shared/BenchNameInput";
import { BenchTabs } from "../shared/BenchTabs";
import {
  type SearchResultModal,
  SearchResultModals,
} from "../shared/SearchResultModals";

import { CreateModelMenu } from "./CreateModelMenu";
import { ModelMoreMenu } from "./ModelMoreMenu";
import S from "./ModelsList.module.css";

const sidebarFeatures: Required<SidebarFeatures> = {
  dataReference: true,
  variables: true,
  snippets: true,
  promptInput: true,
  formatQuery: true,
  aiGeneration: false,
};

function ModelsList({
  activeId,
  onCollapse,
  onOpenModal,
}: {
  activeId: number;
  onCollapse?: () => void;
  onOpenModal: (modal: SearchResultModal) => void;
}) {
  const dispatch = useDispatch();

  const { isLoading: isLoadingModels, data: modelsData } = useFetchModels({
    filter_items_in_personal_collection: undefined,
    wait_for_reindex: true,
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

  const {
    query,
    setQuery,
    filteredItems: filteredModels,
  } = useItemsListFilter(
    models,
    useCallback(
      (model: SearchResult, lowerQuery: string) =>
        model.name.toLowerCase().includes(lowerQuery),
      [],
    ),
  );

  const treeData = useMemo(() => {
    return display === "tree" && filteredModels && collections && currentUser
      ? getTreeItems(collections, filteredModels, "dataset", currentUser.id)
      : [];
  }, [collections, currentUser, display, filteredModels]);

  const handleModelSelect = (item: ITreeNodeItem) => {
    if (typeof item.id === "number") {
      dispatch(push(`/bench/model/${item.id}`));
    }
  };

  const renderMoreMenu = (item: SearchResult) => (
    <ModelMoreMenu item={item} onOpenModal={onOpenModal} />
  );

  return (
    <ItemsListSection
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
      searchInput={
        <Input
          leftSection={<Icon name="search" />}
          placeholder={t`Search models`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      }
      listItems={renderModelsList()}
    />
  );

  function renderModelsList() {
    if (!models || isLoading) {
      return (
        <Center>
          <Loader />
        </Center>
      );
    }

    if (filteredModels.length === 0) {
      return <EmptyState title={t`No models found`} icon="model" />;
    }

    return display === "tree" ? (
      <VirtualizedTree
        data={treeData}
        selectedId={activeId}
        onSelect={handleModelSelect}
        TreeNode={ItemsListTreeNode}
        rightSection={(item) =>
          item.data ? renderMoreMenu(item.data as SearchResult) : null
        }
      />
    ) : (
      <VirtualizedFlatList
        items={filteredModels}
        selectedId={activeId}
        getItemId={(model) => model.id}
        renderItem={(model) => (
          <ModelListItem
            model={model}
            active={model.id === activeId}
            renderMoreMenu={renderMoreMenu}
          />
        )}
      />
    );
  }
}

function ModelListItem({
  model,
  active,
  renderMoreMenu,
}: {
  model: SearchResult;
  active?: boolean;
  renderMoreMenu: (model: SearchResult) => ReactNode;
}) {
  const icon = getIcon({ type: "dataset", ...model });
  return (
    <Box mb="sm" pos="relative">
      <BenchFlatListItem
        label={model.name}
        icon={icon.name}
        subtitle={
          <EllipsifiedCollectionPath
            collection={model.collection}
            className={S.collectionPath}
            ignoreHeightTruncation
          />
        }
        href={`/bench/model/${model.id}`}
        isActive={active}
        rightGroup={renderMoreMenu(model)}
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
  const [modal, setModal] = useState<SearchResultModal | null>(null);
  const onClose = () => setModal(null);

  return (
    <BenchLayout
      nav={<ModelsList activeId={+params.slug} onOpenModal={setModal} />}
      name="model"
    >
      {children}
      {modal && (
        <SearchResultModals
          activeId={+params.slug}
          modal={modal}
          onClose={onClose}
        />
      )}
    </BenchLayout>
  );
};

const ModelHeader = withRouter(
  ({
    question,
    actions,
    params,
  }: {
    question: Question;
    actions?: ReactNode;
    params: { slug: string; tab?: string };
  }) => {
    const dispatch = useDispatch();
    const handleSave = useSaveQuestion();
    const [updateCard] = useUpdateCardMutation();

    const enableSettingsSidebar = shouldShowQuestionSettingsSidebar(question);
    const [modal, setModal] = useState<"info" | null>(null);

    const { data } = useSearchQuery({
      ids: [question.id()],
      models: ["dataset"],
    });

    const modelCollectionId =
      data?.data?.[0]?.collection && (data?.data?.[0]?.collection.id || "root");

    return (
      <>
        <BenchPaneHeader
          title={
            <Stack>
              <BenchNameInput
                initialValue={question.card().name || ""}
                maxLength={QUESTION_NAME_MAX_LENGTH}
                onChange={async (name) => {
                  if (!question.isSaved()) {
                    dispatch(updateQuestion(question.setDisplayName(name)));
                    return;
                  }
                  const res = await updateCard({ id: question.id(), name });
                  const updatedCard = res.data;
                  if (updatedCard) {
                    // HACK: Keeps entity framework data in sync
                    dispatch({
                      type: API_UPDATE_QUESTION,
                      payload: updatedCard,
                    });
                    dispatch({
                      type: INJECT_RTK_QUERY_QUESTION_VALUE,
                      payload: updatedCard,
                    });
                  }
                }}
              />
              {question.isSaved() && (
                <BenchTabs
                  tabs={[
                    {
                      label: t`Query`,
                      to: `/bench/model/${params.slug}`,
                      icon: "sql" as const,
                    },
                    enableSettingsSidebar && {
                      label: t`Settings`,
                      to: `/bench/model/${params.slug}/settings`,
                      icon: "gear" as const,
                    },
                    modelCollectionId && {
                      label: t`Metadata`,
                      to: `/bench/metadata/collection/${modelCollectionId}/model/${params.slug}`,
                      icon: "database" as const,
                    },
                  ].filter((t) => !!t)}
                />
              )}
            </Stack>
          }
          actions={
            <Flex align="center">
              {actions}
              {question.isSaved() && (
                <ToolbarButton
                  aria-label={t`More info`}
                  ml="md"
                  onClick={() => setModal("info")}
                >
                  <FixedSizeIcon name="info" />
                </ToolbarButton>
              )}
            </Flex>
          }
        />
        {modal === "info" && (
          <QuestionInfoSidebar
            question={question}
            onSave={handleSave}
            onClose={() => setModal(null)}
          />
        )}
      </>
    );
  },
);

const ModelEditorHeader = ({ buttons }: { buttons?: ReactNode }) => {
  const question = useSelector(getQuestion);
  if (!question) {
    return null;
  }
  return <ModelHeader question={question} actions={buttons} />;
};

export const ModelEditor = (props: {
  location: Location;
  params: { slug: string; tab?: string };
}) => {
  const dispatch = useDispatch();

  return (
    <QueryBuilder
      key={props.params.slug}
      {...props}
      Header={ModelEditorHeader}
      preventCancel
      onCreateSuccess={(q: Question) => {
        dispatch(replace(`/bench/model/${q.id()}`));
      }}
      sidebarFeatures={sidebarFeatures}
    />
  );
};

export const ModelSettings = ({ params }: { params: { slug: string } }) => {
  const { data: card } = useGetCardQuery({ id: +params.slug });
  const question = useMemo(() => {
    return card && new Question(card);
  }, [card]);
  if (!question) {
    return null;
  }
  return (
    <>
      <ModelHeader question={question} />
      <Box mx="md" mt="sm" maw={480}>
        <SidesheetCard title={t`Caching`}>
          <ModelCacheManagementSection model={question} />
        </SidesheetCard>
      </Box>
    </>
  );
};

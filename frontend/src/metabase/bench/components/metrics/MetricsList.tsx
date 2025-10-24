import cx from "classnames";
import type { Location } from "history";
import type React from "react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { push } from "react-router-redux";
import { useLocalStorage, useMount, usePrevious } from "react-use";
import { t } from "ttag";
import { noop } from "underscore";

import {
  searchApi,
  useGetCardQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
import { listTag } from "metabase/api/tags";
import { BenchFlatListItem } from "metabase/bench/components/shared/BenchFlatListItem";
import { useItemsListFilter } from "metabase/bench/hooks/useItemsListFilter";
import { getIcon } from "metabase/browse/models/utils";
import ActionButton from "metabase/common/components/ActionButton/ActionButton";
import Button from "metabase/common/components/Button";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { SidesheetCard } from "metabase/common/components/Sidesheet/SidesheetCard";
import { VirtualizedFlatList } from "metabase/common/components/VirtualizedFlatList";
import { VirtualizedTree } from "metabase/common/components/tree/VirtualizedTree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useFetchMetrics } from "metabase/common/hooks/use-fetch-metrics";
import ButtonsS from "metabase/css/components/buttons.module.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { newQuestion } from "metabase/lib/urls/questions";
import { EmptyState } from "metabase/metadata/pages/DataModel/components/TablePicker/components/EmptyState";
import { PLUGIN_CACHING } from "metabase/plugins";
import {
  type QueryParams,
  cancelQuery,
  initializeQB,
  locationChanged,
  runQuestionQuery,
  updateQuestion,
} from "metabase/query_builder/actions";
import { shouldShowQuestionSettingsSidebar } from "metabase/query_builder/components/view/sidebars/QuestionSettingsSidebar";
import { useCreateQuestion } from "metabase/query_builder/containers/use-create-question";
import { useSaveQuestion } from "metabase/query_builder/containers/use-save-question";
import {
  getFirstQueryResult,
  getIsDirty,
  getIsResultDirty,
  getQuestion,
  getRawSeries,
  getUiControls,
} from "metabase/query_builder/selectors";
import { MetricEditor as QBMetricEditor } from "metabase/querying/metrics/components/MetricEditor/MetricEditor";
import { getSetting } from "metabase/selectors/settings";
import { getUser } from "metabase/selectors/user";
import { Box, Center, Icon, Input, Loader } from "metabase/ui";
import Question from "metabase-lib/v1/Question";
import type { RawSeries, SearchResult } from "metabase-types/api";

import { BenchLayout } from "../BenchLayout";
import { BenchPaneHeader } from "../BenchPaneHeader";
import {
  ItemsListAddButton,
  ItemsListSection,
} from "../ItemsListSection/ItemsListSection";
import { ItemsListSettings } from "../ItemsListSection/ItemsListSettings";
import { ItemsListTreeNode } from "../ItemsListSection/ItemsListTreeNode";
import { ModelMoreMenu } from "../models/ModelMoreMenu";
import { getTreeItems } from "../models/utils";
import { BenchTabs } from "../shared/BenchTabs";
import {
  type SearchResultModal,
  SearchResultModals,
} from "../shared/SearchResultModals";

import S from "./MetricsList.module.css";

function MetricsList({
  activeId,
  onCollapse,
  onOpenModal,
}: {
  activeId: number | null;
  onCollapse?: () => void;
  onOpenModal: (modal: SearchResultModal) => void;
}) {
  const dispatch = useDispatch();

  const { isLoading: isLoadingMetrics, data: metricsData } = useFetchMetrics({
    wait_for_reindex: true,
  });
  const { isLoading: isLoadingCollections, data: collections } =
    useListCollectionsTreeQuery({ "exclude-archived": true });
  const metrics = useMemo(
    () =>
      metricsData?.data
        ? [...metricsData.data].sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [metricsData?.data],
  );
  const isLoading = isLoadingMetrics || isLoadingCollections;

  const [display = "tree", setDisplay] = useLocalStorage<
    "tree" | "alphabetical"
  >("metabase-bench-metrics-display");
  const currentUser = useSelector(getUser);

  const {
    query,
    setQuery,
    filteredItems: filteredMetrics,
  } = useItemsListFilter(
    metrics,
    useCallback(
      (metric: SearchResult, lowerQuery: string) =>
        metric.name.toLowerCase().includes(lowerQuery),
      [],
    ),
  );

  const treeData = useMemo(() => {
    return filteredMetrics && collections && currentUser && display === "tree"
      ? getTreeItems(collections, filteredMetrics, "metric", currentUser.id)
      : [];
  }, [collections, currentUser, display, filteredMetrics]);

  const handleMetricSelect = (item: ITreeNodeItem) => {
    if (typeof item.id === "number") {
      dispatch(push(`/bench/metric/${item.id}`));
    }
  };

  const renderMoreMenu = (item: SearchResult) => (
    <ModelMoreMenu item={item} onOpenModal={onOpenModal} />
  );

  return (
    <ItemsListSection
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
      addButton={
        <ItemsListAddButton
          onClick={() => {
            const url = newQuestion({
              mode: "bench",
              cardType: "metric",
            });
            dispatch(push(url));
          }}
        />
      }
      searchInput={
        <Input
          leftSection={<Icon name="search" />}
          placeholder={t`Search metrics`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      }
      listItems={renderMetricsList()}
    />
  );

  function renderMetricsList() {
    if (!metrics || isLoading) {
      return (
        <Center>
          <Loader />
        </Center>
      );
    }

    if (filteredMetrics.length === 0) {
      return <EmptyState title={t`No metrics found`} icon="metric" />;
    }

    return display === "tree" ? (
      <VirtualizedTree
        data={treeData}
        selectedId={activeId ?? undefined}
        onSelect={handleMetricSelect}
        TreeNode={ItemsListTreeNode}
        rightSection={(item) =>
          item.data ? renderMoreMenu(item.data as SearchResult) : null
        }
      />
    ) : (
      <VirtualizedFlatList
        items={filteredMetrics}
        selectedId={activeId ?? undefined}
        getItemId={(metric) => metric.id}
        renderItem={(metric) => (
          <MetricListItem
            metric={metric}
            active={metric.id === activeId}
            renderMoreMenu={renderMoreMenu}
          />
        )}
      />
    );
  }
}

function MetricListItem({
  metric,
  active,
  renderMoreMenu,
}: {
  metric: SearchResult;
  active?: boolean;
  renderMoreMenu: (metric: SearchResult) => ReactNode;
}) {
  const icon = getIcon({ type: "dataset", ...metric });
  return (
    <Box mb="sm" pos="relative">
      <BenchFlatListItem
        label={metric.name}
        icon={icon.name}
        subtitle={
          <EllipsifiedCollectionPath
            className={S.collectionPath}
            collection={metric.collection}
            ignoreHeightTruncation
          />
        }
        href={`/bench/metric/${metric.id}`}
        isActive={active}
        rightGroup={renderMoreMenu(metric)}
      />
    </Box>
  );
}

export const MetricsLayout = ({
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
      nav={<MetricsList activeId={+params.slug} onOpenModal={setModal} />}
      name="metric"
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

const MetricHeader = ({
  actions,
  params,
  question,
}: {
  actions?: ReactNode;
  params: QueryParams;
  question: Question;
}) => {
  const enableSettingsSidebar = shouldShowQuestionSettingsSidebar(question);
  return (
    <BenchPaneHeader
      title={
        <BenchTabs
          tabs={[
            {
              label: t`Query`,
              to: `/bench/metric/${params.slug}`,
              icon: "sql" as const,
            },
            enableSettingsSidebar && {
              label: t`Settings`,
              to: `/bench/metric/${params.slug}/settings`,
              icon: "gear" as const,
            },
          ].filter((t) => !!t)}
        />
      }
      actions={actions}
    />
  );
};

export const MetricEditor = ({
  location,
  params,
}: {
  location: Location;
  params: QueryParams;
}) => {
  const dispatch = useDispatch();
  useMount(() => {
    dispatch(initializeQB(location, params));
  });
  const previousLocation = usePrevious(location);
  useEffect(() => {
    if (previousLocation && location !== previousLocation) {
      dispatch(locationChanged(previousLocation, location, params));
    }
  }, [location, params, previousLocation, dispatch]);

  const handleCreate = useCreateQuestion();
  const handleSave = useSaveQuestion();

  const question = useSelector(getQuestion);
  const reportTimezone = useSelector((state) =>
    getSetting(state, "report-timezone-long"),
  );
  const isDirty = useSelector(getIsDirty);
  const isResultDirty = useSelector(getIsResultDirty);
  const result = useSelector(getFirstQueryResult);
  const rawSeries = useSelector(getRawSeries) as RawSeries | null;
  const { isRunning } = useSelector(getUiControls);

  if (!question) {
    return null;
  }

  return (
    <QBMetricEditor
      question={question}
      result={result}
      rawSeries={rawSeries}
      reportTimezone={reportTimezone}
      isDirty={isDirty}
      isResultDirty={isResultDirty}
      isRunning={isRunning}
      onChange={(q) => dispatch(updateQuestion(q))}
      onCreate={async (q) => {
        const result = await handleCreate(q);
        dispatch(push(`/bench/metric/${result.id()}`));

        // TODO: Find a way to remove the setTimeout. Search reindexing appears to be async so refetching immediately doesn't return a list containing the newly added item.
        setTimeout(() => {
          dispatch(searchApi.util.invalidateTags([listTag("card")]));
        }, 100);

        return result;
      }}
      onSave={handleSave}
      onCancel={noop}
      onRunQuery={() => dispatch(runQuestionQuery())}
      onCancelQuery={() => dispatch(cancelQuery())}
      Header={(headerProps) => (
        <MetricHeader
          params={params}
          question={question}
          actions={
            !question.isSaved() ? (
              <Button
                key="create"
                primary
                small
                onClick={() => headerProps.onCreate(question)}
              >
                {t`Save`}
              </Button>
            ) : (
              <ActionButton
                key="save"
                actionFn={() => headerProps.onSave(question)}
                disabled={!headerProps.isRunnable || !isDirty}
                normalText={t`Save`}
                activeText={t`Saving…`}
                failedText={t`Save failed`}
                successText={t`Saved`}
                className={cx(
                  ButtonsS.Button,
                  ButtonsS.ButtonPrimary,
                  ButtonsS.ButtonSmall,
                )}
              />
            )
          }
        />
      )}
    />
  );
};

export const MetricSettings = ({ params }: { params: { slug: string } }) => {
  const { data: card } = useGetCardQuery({ id: +params.slug });
  const question = useMemo(() => card && new Question(card), [card]);
  const [page, setPage] = useState<"default" | "caching">("default");
  if (!question) {
    return null;
  }
  return (
    <>
      <MetricHeader params={params} question={question} />
      <Box mx="md" mt="sm" maw={480}>
        <SidesheetCard title={t`Caching`}>
          <PLUGIN_CACHING.SidebarCacheSection
            model="question"
            item={question}
            setPage={setPage}
            key={page}
          />
        </SidesheetCard>
      </Box>
      {page === "caching" && (
        <PLUGIN_CACHING.SidebarCacheForm
          item={question}
          model="question"
          onBack={() => setPage("default")}
          onClose={() => setPage("default")}
          pt="md"
        />
      )}
    </>
  );
};

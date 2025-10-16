import cx from "classnames";
import type { Location } from "history";
import type React from "react";
import { useEffect, useMemo } from "react";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { useMount, usePrevious } from "react-use";
import { t } from "ttag";
import { noop } from "underscore";

import { searchApi, useListCollectionsTreeQuery } from "metabase/api";
import { listTag } from "metabase/api/tags";
import { getIcon } from "metabase/browse/models/utils";
import ActionButton from "metabase/common/components/ActionButton/ActionButton";
import Button from "metabase/common/components/Button";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { Tree } from "metabase/common/components/tree/Tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useFetchMetrics } from "metabase/common/hooks/use-fetch-metrics";
import ButtonsS from "metabase/css/components/buttons.module.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { newQuestion } from "metabase/lib/urls/questions";
import {
  type QueryParams,
  cancelQuery,
  initializeQB,
  locationChanged,
  runQuestionQuery,
  updateQuestion,
} from "metabase/query_builder/actions";
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
import {
  Box,
  Center,
  FixedSizeIcon,
  Flex,
  Loader,
  NavLink,
  Text,
} from "metabase/ui";
import type { RawSeries, SearchResult } from "metabase-types/api";

import { BenchLayout } from "../BenchLayout";
import { BenchPaneHeader } from "../BenchPaneHeader";
import {
  ItemsListAddButton,
  ItemsListSection,
} from "../ItemsListSection/ItemsListSection";
import { ItemsListSettings } from "../ItemsListSection/ItemsListSettings";
import { ItemsListTreeNode } from "../ItemsListSection/ItemsListTreeNode";
import { useItemsListQuery } from "../ItemsListSection/useItemsListQuery";
import { getTreeItems } from "../models/utils";

function MetricsList({
  activeId,
  onCollapse,
  location,
}: {
  activeId: number | null;
  onCollapse?: () => void;
  location: Location;
}) {
  const dispatch = useDispatch();
  const { isLoading: isLoadingMetrics, data: metricsData } = useFetchMetrics();
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

  const listSettingsProps = useItemsListQuery({
    location,
    settings: [
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
    ],
    defaults: { display: "tree" },
  });

  const currentUser = useSelector(getUser);
  const treeData = useMemo(() => {
    return metrics && collections && currentUser
      ? getTreeItems(collections, metrics, "metric", currentUser.id)
      : [];
  }, [collections, currentUser, metrics]);

  const { query } = location;
  const handleMetricSelect = (item: ITreeNodeItem) => {
    if (typeof item.id === "number") {
      dispatch(push({ query, pathname: `/bench/metric/${item.id}` }));
    }
  };

  return (
    <ItemsListSection
      sectionTitle={t`Metrics`}
      settings={<ItemsListSettings {...listSettingsProps} />}
      onCollapse={onCollapse}
      addButton={
        <ItemsListAddButton
          onClick={() => {
            const url = newQuestion({
              mode: "bench",
              cardType: "metric",
            });
            dispatch(push({ query, pathname: url }));
          }}
        />
      }
      listItems={
        !metrics || isLoading ? (
          <Center>
            <Loader />
          </Center>
        ) : listSettingsProps.values.display === "tree" ? (
          <Box mx="-sm">
            <Tree
              data={treeData}
              selectedId={activeId ?? undefined}
              onSelect={handleMetricSelect}
              emptyState={<Text c="text-light">{t`No models found`}</Text>}
              TreeNode={ItemsListTreeNode}
            />
          </Box>
        ) : (
          metrics.map((metric) => (
            <MetricListItem
              key={metric.id}
              metric={metric}
              active={metric.id === activeId}
              query={query}
            />
          ))
        )
      }
    />
  );
}

function MetricListItem({
  metric,
  active,
  query,
}: {
  metric: SearchResult;
  active?: boolean;
  query?: Location["query"];
}) {
  const icon = getIcon({ type: "dataset", ...metric });
  return (
    <Box mb="sm">
      <NavLink
        component={Link}
        to={{ query, pathname: `/bench/metric/${metric.id}` }}
        active={active}
        label={
          <>
            <Flex gap="sm" align="center">
              <FixedSizeIcon {...icon} size={16} c="brand" />
              <Text fw="bold" c={active ? "brand" : undefined}>
                {metric.name}
              </Text>
            </Flex>
            <Flex gap="sm" c="text-light" ml="lg">
              <FixedSizeIcon name="folder" />
              <EllipsifiedCollectionPath collection={metric.collection} />
            </Flex>
          </>
        }
      />
    </Box>
  );
}

export const MetricsLayout = ({
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
      nav={<MetricsList activeId={+params.slug} location={location} />}
      name="model"
    >
      {children}
    </BenchLayout>
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
        <BenchPaneHeader
          title={question.displayName() ?? t`New metric`}
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

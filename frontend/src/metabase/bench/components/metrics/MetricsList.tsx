import cx from "classnames";
import type { Location } from "history";
import type React from "react";
import { useEffect } from "react";
import { Link } from "react-router";
import { useMount, usePrevious } from "react-use";
import { t } from "ttag";

import { getIcon } from "metabase/browse/models/utils";
import ActionButton from "metabase/common/components/ActionButton/ActionButton";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { useFetchMetrics } from "metabase/common/hooks/use-fetch-metrics";
import ButtonsS from "metabase/css/components/buttons.module.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  type QueryParams,
  cancelQuery,
  initializeQB,
  locationChanged,
  runQuestionQuery,
  updateQuestion,
} from "metabase/query_builder/actions";
import { useSaveQuestion } from "metabase/query_builder/containers/use-save-question";
import {
  getFirstQueryResult,
  getIsDirty,
  getIsResultDirty,
  getQuestion,
  getRawSeries,
  getUiControls,
} from "metabase/query_builder/selectors";
import { MetricEditorBody } from "metabase/querying/metrics/components/MetricEditor/MetricEditorBody";
import { MetricEditorFooter } from "metabase/querying/metrics/components/MetricEditor/MetricEditorFooter";
import { getSetting } from "metabase/selectors/settings";
import { Box, Center, FixedSizeIcon, Flex, Loader, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { RawSeries, RecentCollectionItem } from "metabase-types/api";

import { BenchLayout } from "../BenchLayout";
import { BenchPaneHeader } from "../BenchPaneHeader";
import { ItemsListSection } from "../ItemsListSection/ItemsListSection";

function MetricsList() {
  const { isLoading, data } = useFetchMetrics();
  const metrics = data?.data;

  return (
    <ItemsListSection
      sectionTitle="Metrics"
      onAddNewItem={() => {}}
      listItems={
        !metrics || isLoading ? (
          <Center>
            <Loader />
          </Center>
        ) : (
          metrics.map((metric) => (
            <MetricListItem key={metric.id} metric={metric} />
          ))
        )
      }
    />
  );
}

function MetricListItem({ metric }: { metric: RecentCollectionItem }) {
  const icon = getIcon({ type: "dataset", ...metric });
  return (
    <Box mb="sm">
      <Link to={`/bench/metric/${metric.id}`}>
        <Flex gap="sm" align="center">
          <FixedSizeIcon {...icon} size={16} c="brand" />
          <Text fw="bold">{metric.name}</Text>
        </Flex>
        <Flex gap="sm" c="text-light" ml="lg">
          <FixedSizeIcon name="folder" />
          <EllipsifiedCollectionPath collection={metric.collection} />
        </Flex>
      </Link>
    </Box>
  );
}

export const MetricsLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <BenchLayout nav={<MetricsList />} name="model">
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

  const isRunnable = Lib.canRun(question.query(), "metric");

  return (
    <>
      <BenchPaneHeader
        title={question.displayName()}
        actions={
          <ActionButton
            key="save"
            actionFn={() => handleSave(question)}
            disabled={!isRunnable || !isDirty}
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
        }
      />
      <MetricEditorBody
        question={question}
        reportTimezone={reportTimezone}
        isDirty={isDirty}
        isResultDirty={isResultDirty}
        isRunnable={isRunnable}
        onChange={(q) => dispatch(updateQuestion(q))}
        onRunQuery={() => dispatch(runQuestionQuery())}
        excludeSidebar
        padding="md"
        height={window.innerHeight / 2}
      />
      <MetricEditorFooter
        question={question}
        result={result}
        rawSeries={rawSeries}
        isRunnable={isRunnable}
        isRunning={isRunning}
        isResultDirty={isResultDirty}
        onRunQuery={() => dispatch(runQuestionQuery())}
        onCancelQuery={() => dispatch(cancelQuery())}
      />
    </>
  );
};

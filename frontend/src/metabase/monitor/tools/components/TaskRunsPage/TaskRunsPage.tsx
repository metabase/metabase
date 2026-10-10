import { useElementSize } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useLazyListTaskRunsQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { useAbortableQuery } from "metabase/common/hooks/use-abortable-query";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Sidebar } from "metabase/monitor/components/MonitorLayout/Sidebar";
import { useLocation, useParams } from "metabase/router";
import { Center, Flex, Group, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  ListTaskRunsRequest,
  ListTaskRunsSortColumn,
  SortingOptions,
  TaskRunStatus,
} from "metabase-types/api";

import { toBackendStartedAt } from "../../utils";
import { ScheduledJobs } from "../JobInfoApp";
import { JobTriggersSidebar } from "../JobInfoApp/JobTriggersSidebar";
import { TaskRunTypePicker } from "../RunTypePicker";
import { TaskRunEntityPicker } from "../TaskRunEntityPicker";
import { TaskRunDatePicker } from "../TaskRunStartedAtPicker";
import {
  type TaskRunOutcome,
  TaskRunStatusPicker,
} from "../TaskRunStatusPicker/TaskRunStatusPicker";

import { TaskRunsTable } from "./TaskRunsTable";
import { PAGE_SIZE } from "./constants";
import { type TaskRunsTab, urlStateConfig } from "./utils";

type SectionFilters = Omit<ListTaskRunsRequest, "status" | "limit" | "offset">;

/** The statuses behind each value of the outcome filter; "failed" includes abandoned runs. */
const COMPLETED_STATUSES: Record<TaskRunOutcome | "all", TaskRunStatus[]> = {
  all: ["success", "failed", "abandoned"],
  success: ["success"],
  failed: ["failed", "abandoned"],
};

export const TaskRunsPage = () => {
  const location = useLocation();
  // set on /monitor/tasks/jobs/:jobKey: a job's triggers open in the sidebar
  const { jobKey } = useParams<{ jobKey?: string }>();
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [
    {
      tab: urlTab,
      status,
      sort_column,
      sort_direction,
      "run-type": runType,
      "entity-type": entityType,
      "entity-id": entityId,
      "started-at": startedAt,
      "include-today": includeToday,
    },
    { patchUrlState },
  ] = useUrlState(location, urlStateConfig);
  const tab: TaskRunsTab = jobKey != null ? "scheduled" : urlTab;
  const sortingOptions = useMemo(
    () => ({ sort_column, sort_direction }),
    [sort_column, sort_direction],
  );

  const filters: SectionFilters = {
    "sort-column": sort_column,
    "sort-direction": sort_direction,
    "run-type": runType ?? undefined,
    "entity-type": entityType ?? undefined,
    "entity-id": entityId ?? undefined,
    "started-at": toBackendStartedAt(startedAt, includeToday),
  };

  // remount the sections when the filters change so each one starts at page 0
  const filtersKey = JSON.stringify(filters);

  const entityValue = entityType && entityId ? { entityType, entityId } : null;

  const tabUrl = (nextTab: TaskRunsTab) => {
    if (nextTab === "scheduled") {
      return Urls.monitorJobs();
    }
    const params = new URLSearchParams(
      tab === "scheduled" ? "" : location.search,
    );
    params.delete("tab");
    const search = params.toString();
    return search ? `${Urls.monitorTasks()}?${search}` : Urls.monitorTasks();
  };
  // the URL state hook only reads the query string on mount, so the link alone
  // would leave it on the old tab: patch it on click as well. Not on the job
  // sidebar route, where the hook would navigate back to that path.
  const tabs: PillTab[] = (
    [
      ["tasks", t`Completed tasks`],
      ["scheduled", t`Scheduled jobs`],
    ] as const
  ).map(([nextTab, label]) => ({
    label,
    to: tabUrl(nextTab),
    isSelected: tab === nextTab,
    onClick:
      jobKey == null
        ? () => patchUrlState({ tab: nextTab }, { immediate: true })
        : undefined,
  }));

  return (
    <Flex ref={containerRef} h="100%" wrap="nowrap">
      {/* several tables stack here, so the page scrolls instead of each table */}
      <MonitorMain gap="xl" style={{ overflowY: "auto" }}>
        <MonitorHeaderTitle>{t`Background tasks`}</MonitorHeaderTitle>

        <TaskRunsSection
          key={`active-${filtersKey}`}
          title={t`Active tasks`}
          statuses={["started"]}
          emptyLabel={t`No tasks are currently running`}
          filters={filters}
          sortingOptions={sortingOptions}
          onSortingOptionsChange={patchUrlState}
        />

        <PillTabNavigation tabs={tabs} />

        {tab === "scheduled" ? (
          <ScheduledJobs />
        ) : (
          <>
            <Group gap="lg" align="center" wrap="wrap">
              <TaskRunStatusPicker
                value={status}
                onChange={(status) => patchUrlState({ status })}
              />

              <TaskRunTypePicker
                value={runType}
                onChange={(runType) =>
                  patchUrlState({
                    "run-type": runType,
                    "entity-type": null,
                    "entity-id": null,
                  })
                }
              />

              <TaskRunDatePicker
                value={startedAt}
                includeToday={includeToday}
                placeholder={t`Started at`}
                onChange={(nextStartedAt, nextIncludeToday) =>
                  patchUrlState({
                    "started-at": nextStartedAt,
                    "include-today": nextIncludeToday,
                    ...(nextStartedAt !== startedAt && {
                      "entity-type": null,
                      "entity-id": null,
                    }),
                  })
                }
              />

              <TaskRunEntityPicker
                runType={runType}
                startedAt={startedAt}
                includeToday={includeToday}
                value={entityValue}
                onChange={(entity) =>
                  patchUrlState({
                    "entity-type": entity?.entityType ?? null,
                    "entity-id": entity?.entityId ?? null,
                  })
                }
              />
            </Group>

            <TaskRunsSection
              key={`completed-${filtersKey}-${status}`}
              statuses={COMPLETED_STATUSES[status ?? "all"]}
              filters={filters}
              sortingOptions={sortingOptions}
              onSortingOptionsChange={patchUrlState}
            />
          </>
        )}
      </MonitorMain>
      {jobKey != null && (
        <Sidebar containerWidth={containerWidth}>
          <JobTriggersSidebar jobKey={jobKey} />
        </Sidebar>
      )}
    </Flex>
  );
};

type TaskRunsSectionProps = {
  title?: string;
  statuses: TaskRunStatus[];
  emptyLabel?: string;
  filters: SectionFilters;
  sortingOptions: SortingOptions<ListTaskRunsSortColumn>;
  onSortingOptionsChange: (
    sortingOptions: SortingOptions<ListTaskRunsSortColumn>,
  ) => void;
};

const TaskRunsSection = ({
  title,
  statuses,
  emptyLabel,
  filters,
  sortingOptions,
  onSortingOptionsChange,
}: TaskRunsSectionProps) => {
  // each section pages on its own; the filters above apply to all of them
  const [page, setPage] = useState(0);

  const {
    data: taskRunsData,
    isFetching,
    isLoading,
    error,
  } = useAbortableQuery(
    useLazyListTaskRunsQuery,
    {
      ...filters,
      status: statuses,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    {
      refetchOnMountOrArgChange: true,
    },
  );

  const taskRuns = taskRunsData?.data ?? [];
  const total = taskRunsData?.total ?? 0;

  return (
    <Stack gap="md" data-testid={`task-runs-section-${statuses.join("-")}`}>
      {title && <MonitorHeaderTitle>{title}</MonitorHeaderTitle>}

      {error !== undefined ? (
        <Center flex={1}>
          <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
        </Center>
      ) : (
        <TaskRunsTable
          taskRuns={taskRuns}
          emptyLabel={emptyLabel}
          isFetching={isFetching}
          isLoading={isLoading}
          page={page}
          sortingOptions={sortingOptions}
          onSortingOptionsChange={(sortingOptions) => {
            setPage(0);
            onSortingOptionsChange(sortingOptions);
          }}
        />
      )}

      {!isLoading && error === undefined && total > PAGE_SIZE && (
        <Flex justify="end">
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            itemsLength={taskRuns.length}
            total={total}
            showTotal
            onPreviousPage={() => setPage(page - 1)}
            onNextPage={() => setPage(page + 1)}
          />
        </Flex>
      )}
    </Stack>
  );
};

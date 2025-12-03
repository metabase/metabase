import { useDebouncedValue } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Button, Flex, Icon, Stack, TextInput, Tooltip } from "metabase/ui";
import { useListTransformJobsQuery } from "metabase-enterprise/api";
import { TransformsSectionHeader } from "metabase-enterprise/data-studio/app/pages/TransformsSectionLayout/TransformsSectionHeader";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs/DataStudioBreadcrumbs";
import { Table } from "metabase-enterprise/data-studio/common/components/Table/Table";
import { ListEmptyState } from "metabase-enterprise/transforms/components/ListEmptyState";
import { SidebarListItem } from "metabase-enterprise/transforms/pages/TransformSidebarLayout/SidebarListItem/SidebarListItem";

import S from "../TransformSidebarLayout/JobsSidebar/JobsSidebar.module.css";
import { SidebarList } from "../TransformSidebarLayout/SidebarList";
import { SidebarLoadingState } from "../TransformSidebarLayout/SidebarLoadingState";
import { SidebarSearchAndControls } from "../TransformSidebarLayout/SidebarSearchAndControls";
import { JOB_SORT_OPTIONS } from "../TransformSidebarLayout/SidebarSortControl";
import {
  lastModifiedSorter,
  nameSorter,
} from "../TransformSidebarLayout/utils";
import { ForwardRefLink } from "metabase/common/components/Link";

const DEFAULT_SORT_TYPE = "alphabetical";

interface JobListPagerProps {
  selectedJobId?: number;
}

export const JobListPage = ({ selectedJobId }: JobListPagerProps) => {
  const dispatch = useDispatch();
  const systemTimezone = useSetting("system-timezone");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
  const { value: sortType, setValue: setSortType } = useUserKeyValue({
    namespace: "transforms",
    key: "jobs-sort-type",
    defaultValue: DEFAULT_SORT_TYPE,
  });

  const { data: jobs, error, isLoading } = useListTransformJobsQuery({});

  const filteredJobs = useMemo(() => {
    if (!jobs) {
      return [];
    }

    if (!debouncedSearchQuery) {
      return jobs;
    }

    const query = debouncedSearchQuery.toLowerCase();
    return jobs.filter((job) => job.name.toLowerCase().includes(query));
  }, [jobs, debouncedSearchQuery]);

  const sortFn = sortType === "last-modified" ? lastModifiedSorter : nameSorter;

  const jobsSorted = useMemo(
    () => [...filteredJobs].sort(sortFn),
    [filteredJobs, sortFn],
  );

  const handleAdd = () => {
    dispatch(push(Urls.newTransformJob()));
  };

  const handleSelect = (item) => {
    dispatch(push(Urls.transformJob(item.id)));
  };

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  return (
    <>
      <TransformsSectionHeader
        leftSection={<DataStudioBreadcrumbs>{t`Jobs`}</DataStudioBreadcrumbs>}
      />
      <Stack px="3.5rem">
        <Flex gap="0.5rem">
          <TextInput
            placeholder="Search..."
            leftSection={<Icon name="search" />}
            bdrs="md"
            flex="1"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button
            leftSection={<Icon name="add" />}
            component={ForwardRefLink}
            to={Urls.newTransformJob()}
          >{t`New`}</Button>
        </Flex>

        <Flex direction="column" flex={1} mih={0}>
          {isLoading ? (
            <SidebarLoadingState />
          ) : jobsSorted.length === 0 ? (
            <ListEmptyState
              label={debouncedSearchQuery ? t`No jobs found` : t`No jobs yet`}
            />
          ) : (
            // <SidebarList>
            //   {jobsSorted.map((job) => {
            //     const subtitle =
            //       job.last_run?.start_time &&
            //       `${job.last_run?.status === "failed" ? t`Failed` : t`Last run`}: ${new Date(
            //         job.last_run.start_time,
            //       ).toLocaleString("en-US", {
            //         timeZone: systemTimezone ?? undefined,
            //       })}`;

            //     return (
            //       <SidebarListItem
            //         key={job.id}
            //         icon="play_outlined"
            //         href={Urls.transformJob(job.id)}
            //         label={job.name}
            //         subtitle={subtitle}
            //         isActive={job.id === selectedJobId}
            //       />
            //     );
            //   })}
            // </SidebarList>

            <Table
              data={jobsSorted.map((j) => ({
                ...j,
                last_run_time: j.last_run
                  ? new Date(j.last_run.start_time).toDateString()
                  : "Never",
              }))}
              columns={[
                {
                  id: "name",
                  name: "Name",
                  grow: true,
                },
                { id: "last_run_time", name: "Last Run", width: "150px" },
              ]}
              onSelect={handleSelect}
            />
          )}
        </Flex>
      </Stack>
    </>
  );
};

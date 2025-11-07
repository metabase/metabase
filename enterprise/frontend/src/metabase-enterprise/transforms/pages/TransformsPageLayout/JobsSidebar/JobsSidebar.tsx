import { useDebouncedValue } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Button, Flex, Icon } from "metabase/ui";
import { useListTransformJobsQuery } from "metabase-enterprise/api";

import { ListEmptyState } from "../ListEmptyState";
import { SidebarContainer } from "../SidebarContainer";
import { SidebarLoadingState } from "../SidebarLoadingState";
import { SidebarSearch } from "../SidebarSearch";
import { JOB_SORT_OPTIONS, SidebarSortControl } from "../SidebarSortControl";
import { TransformsInnerNav } from "../TransformsInnerNav";
import { SidebarList } from "../TransformsSidebarLayout/SidebarList";
import { SidebarListItem } from "../TransformsSidebarLayout/SidebarListItem/SidebarListItem";
import { lastModifiedSorter, nameSorter } from "../utils";

const DEFAULT_SORT_TYPE = "alphabetical";

interface JobsSidebarProps {
  selectedJobId?: number;
}

export const JobsSidebar = ({ selectedJobId }: JobsSidebarProps) => {
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

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  return (
    <SidebarContainer data-testid="jobs-sidebar">
      <Flex direction="column" gap="md" px="md" pt="md" pb="md">
        <TransformsInnerNav />
        <SidebarSearch value={searchQuery} onChange={setSearchQuery} />
        <SidebarSortControl
          value={sortType}
          options={JOB_SORT_OPTIONS}
          addButton={
            <Button
              p="sm"
              w={40}
              h={40}
              leftSection={<Icon name="add" size={16} />}
              aria-label={t`Create a job`}
              onClick={handleAdd}
            />
          }
          onChange={setSortType}
        />
      </Flex>
      <Flex direction="column" flex={1} mih={0}>
        {isLoading ? (
          <SidebarLoadingState />
        ) : jobsSorted.length === 0 ? (
          <ListEmptyState
            label={debouncedSearchQuery ? t`No jobs found` : t`No jobs yet`}
          />
        ) : (
          <SidebarList>
            {jobsSorted.map((job) => {
              const subtitle =
                job.last_run?.start_time &&
                `${job.last_run?.status === "failed" ? t`Failed` : t`Last run`}: ${new Date(
                  job.last_run.start_time,
                ).toLocaleString("en-US", {
                  timeZone: systemTimezone ?? undefined,
                })}`;

              return (
                <SidebarListItem
                  key={job.id}
                  icon="play_outlined"
                  href={Urls.transformJob(job.id)}
                  label={job.name}
                  subtitle={subtitle}
                  isActive={job.id === selectedJobId}
                />
              );
            })}
          </SidebarList>
        )}
      </Flex>
    </SidebarContainer>
  );
};

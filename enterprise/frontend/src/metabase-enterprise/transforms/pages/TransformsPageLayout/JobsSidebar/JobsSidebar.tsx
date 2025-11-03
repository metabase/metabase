import { useDebouncedValue } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { push } from "react-router-redux";
import { useLocalStorage } from "react-use";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Flex } from "metabase/ui";
import { useListTransformJobsQuery } from "metabase-enterprise/api";

import { ListEmptyState } from "../ListEmptyState";
import { SidebarContainer } from "../SidebarContainer";
import { SidebarSearch } from "../SidebarSearch";
import {
  JOB_SORT_OPTIONS,
  SidebarSortControl,
  type SortOption,
} from "../SidebarSortControl";
import { TransformsInnerNav } from "../TransformsInnerNav";
import { SidebarList } from "../TransformsSidebarLayout/SidebarList";
import { SidebarListItem } from "../TransformsSidebarLayout/SidebarListItem/SidebarListItem";
import { lastModifiedSorter, nameSorter } from "../utils";

interface JobsSidebarProps {
  selectedJobId?: number;
}

export const JobsSidebar = ({ selectedJobId }: JobsSidebarProps) => {
  const dispatch = useDispatch();
  const systemTimezone = useSetting("system-timezone");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
  const [sortType, setSortType] = useLocalStorage<SortOption>(
    "metabase-jobs-display",
    "alphabetical",
  );

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

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <SidebarContainer>
      <Flex direction="column" gap="md" px="md" pt="md" pb="md">
        <TransformsInnerNav />
        <SidebarSearch value={searchQuery} onChange={setSearchQuery} />
        <SidebarSortControl
          value={sortType}
          onChange={setSortType}
          onAdd={handleAdd}
          options={JOB_SORT_OPTIONS}
        />
      </Flex>
      {jobsSorted.length === 0 ? (
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
    </SidebarContainer>
  );
};

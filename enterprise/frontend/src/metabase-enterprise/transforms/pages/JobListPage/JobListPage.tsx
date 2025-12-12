import { useDebouncedValue } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import DateTime from "metabase/common/components/DateTime";
import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { TreeColumnDef } from "metabase/ui";
import {
  Button,
  Card,
  Flex,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  useTreeTable,
} from "metabase/ui";
import { useListTransformJobsQuery } from "metabase-enterprise/api";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import { ListEmptyState } from "metabase-enterprise/transforms/components/ListEmptyState";
import { ListLoadingState } from "metabase-enterprise/transforms/components/ListLoadingState";
import type { TransformJob } from "metabase-types/api";

export const JobListPage = () => {
  const dispatch = useDispatch();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);

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

  const handleSelect = (item: TransformJob) => {
    dispatch(push(Urls.transformJob(item.id)));
  };

  const jobColumnDef = useMemo<TreeColumnDef<TransformJob>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t`Name`,
      },
      {
        id: "last_run",
        accessorFn: (job) => job.last_run?.start_time,
        header: t`Last Run`,
        cell: ({ node }) =>
          node.data.last_run ? (
            <>
              {node.data.last_run.status === "failed" ? t`Failed` : t`Last run`}
              <DateTime value={node.data.last_run.start_time} />
            </>
          ) : null,
      },
    ],
    [],
  );

  const treeTableInstance = useTreeTable({
    data: filteredJobs,
    columns: jobColumnDef,
    getNodeId: (node) => String(node.id),
  });

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  return (
    <>
      <PaneHeader
        breadcrumbs={<DataStudioBreadcrumbs>{t`Jobs`}</DataStudioBreadcrumbs>}
        px="3.5rem"
        py={0}
        showMetabotButton
      />
      <Stack
        bg="background-light"
        data-testid="transforms-job-list"
        h="100%"
        pb="2rem"
        px="3.5rem"
        style={{ overflow: "hidden" }}
      >
        <Flex gap="0.5rem">
          <TextInput
            placeholder={t`Search...`}
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
            <ListLoadingState />
          ) : filteredJobs.length === 0 ? (
            <ListEmptyState
              label={debouncedSearchQuery ? t`No jobs found` : t`No jobs yet`}
            />
          ) : (
            <Card withBorder p={0}>
              <TreeTable
                instance={treeTableInstance}
                onRowClick={(node) => {
                  if (node.hasChildren) {
                    treeTableInstance.expansion.toggle(node.id);
                  } else {
                    handleSelect(node.data);
                  }
                }}
              />
            </Card>
          )}
        </Flex>
      </Stack>
    </>
  );
};

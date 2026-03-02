import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListTransformJobsQuery } from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { ListEmptyState } from "metabase/transforms/components/ListEmptyState";
import type { TreeTableColumnDef } from "metabase/ui";
import {
  Button,
  Card,
  Flex,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type { TransformJob } from "metabase-types/api";

export const JobListPage = () => {
  const dispatch = useDispatch();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: jobs = [], error, isLoading } = useListTransformJobsQuery({});

  const handleRowActivate = useCallback(
    (row: { original: TransformJob }) => {
      dispatch(push(Urls.transformJob(row.original.id)));
    },
    [dispatch],
  );

  const jobColumnDef = useMemo<TreeTableColumnDef<TransformJob>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t`Name`,
        minWidth: 120,
        cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
      },
      {
        id: "last_run",
        accessorFn: (job) => job.last_run?.start_time,
        header: t`Last Run`,
        minWidth: 120,
        cell: ({ row }) =>
          row.original.last_run ? (
            <Ellipsified>
              {row.original.last_run.status === "failed"
                ? t`Failed`
                : t`Last run`}{" "}
              <DateTime value={row.original.last_run.start_time} />
            </Ellipsified>
          ) : null,
      },
    ],
    [],
  );

  const treeTableInstance = useTreeTableInstance({
    data: jobs,
    columns: jobColumnDef,
    getNodeId: (node) => String(node.id),
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
    onRowActivate: handleRowActivate,
  });

  let emptyMessage = null;
  if (jobs.length === 0) {
    emptyMessage = t`No jobs yet`;
  } else if (searchQuery) {
    emptyMessage = t`No jobs found`;
  }

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  return (
    <PageContainer data-testid="transforms-job-list" gap={0}>
      <PaneHeader
        breadcrumbs={<DataStudioBreadcrumbs>{t`Jobs`}</DataStudioBreadcrumbs>}
        py={0}
        showMetabotButton
      />
      <Stack style={{ overflow: "hidden" }}>
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
          <Card withBorder p={0}>
            {isLoading ? (
              <TreeTableSkeleton columnWidths={[0.6, 0.3]} />
            ) : (
              <TreeTable
                instance={treeTableInstance}
                emptyState={
                  emptyMessage ? <ListEmptyState label={emptyMessage} /> : null
                }
                onRowClick={handleRowActivate}
              />
            )}
          </Card>
        </Flex>
      </Stack>
    </PageContainer>
  );
};

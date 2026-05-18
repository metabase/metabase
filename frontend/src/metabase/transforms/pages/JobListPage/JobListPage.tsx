import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListTransformJobsQuery } from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { ForwardRefLink } from "metabase/common/components/Link";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { useDispatch, useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { LockedTransformsBanner } from "metabase/transforms/components/LockedTransformsBanner/LockedTransformsBanner";
import { TransformBadge } from "metabase/transforms/components/TransformBadge/TransformBadge";
import type { TreeTableColumnDef } from "metabase/ui";
import {
  Button,
  Card,
  Ellipsified,
  Flex,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { TransformJob } from "metabase-types/api";

import { JobListMoreMenu } from "../../components/JobListMoreMenu";
import { JobMoreMenu } from "../../components/JobMoreMenu";

export const JobListPage = () => {
  const dispatch = useDispatch();
  const [searchQuery, setSearchQuery] = useState("");

  const isAdmin = useSelector(getUserIsAdmin);

  const { data: jobs = [], error, isLoading } = useListTransformJobsQuery({});

  const handleRowActivate = useCallback(
    (row: { original: TransformJob }) => {
      dispatch(push(Urls.transformJob(row.original.id)));
    },
    [dispatch],
  );

  const isMeterLocked = useSetting("transforms-meter-locked");
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
      {
        id: "status",
        maxWidth: 200,
        cell: ({ row }) =>
          isMeterLocked || !row.original.active ? (
            <TransformBadge bg="background-secondary">
              {t`Disabled`}
            </TransformBadge>
          ) : null,
      },
      ...(isAdmin
        ? ([
            {
              id: "actions",
              header: "",
              width: 48,
              cell: ({ row }) => <JobMoreMenu job={row.original} />,
            },
          ] satisfies TreeTableColumnDef<TransformJob>[])
        : []),
    ],
    [isMeterLocked, isAdmin],
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
        {isMeterLocked && <LockedTransformsBanner />}
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
          {isAdmin && jobs.length > 0 && <JobListMoreMenu jobs={jobs} />}
        </Flex>

        <Flex direction="column" flex={1} mih={0}>
          <Card withBorder p={0}>
            {isLoading ? (
              <TreeTableSkeleton columnWidths={[0.55, 0.3, 0.1, 0.05]} />
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

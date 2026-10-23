import type { Row } from "@tanstack/react-table";
import { type MouseEvent, useCallback, useMemo, useState } from "react";
import { jt, t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { ForwardRefLink } from "metabase/common/components/Link";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { MoreMenuButton } from "metabase/common/data-studio/components/MoreMenuButton";
import { useMetadataToasts } from "metabase/common/hooks";
import { useNavigate } from "metabase/router";
import type { TreeTableColumnDef } from "metabase/ui";
import {
  Card,
  Code,
  Ellipsified,
  Icon,
  Menu,
  Stack,
  TextInput,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { useRunTransformTestMutation } from "metabase-enterprise/api";
import type { TransformTest, TransformTestRun } from "metabase-types/api";

import { trackTransformTestTriggerManualRun } from "../../../analytics";
import { MB_CLI_NAME } from "../../../constants";
import { isFailedTestRunStatus } from "../../../utils";

type TransformTestListProps = {
  tests: TransformTest[];
  readOnly: boolean;
};

export function TransformTestList({ tests, readOnly }: TransformTestListProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const columns = useMemo(() => getColumns(readOnly), [readOnly]);

  const handleRowActivate = useCallback(
    (row: Row<TransformTest>) => {
      navigate(Urls.transformTest(row.original.transform_id, row.original.id));
    },
    [navigate],
  );

  const treeTableInstance = useTreeTableInstance({
    data: tests,
    columns,
    getNodeId: (test) => String(test.id),
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
    onRowActivate: handleRowActivate,
  });

  return (
    <Stack>
      <TextInput
        placeholder={t`Search...`}
        leftSection={<Icon name="search" />}
        bdrs="sm"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />
      <Card withBorder p={0}>
        <TreeTable
          instance={treeTableInstance}
          emptyState={
            searchQuery ? (
              <ListEmptyState label={t`No tests found`} />
            ) : (
              <ListEmptyState
                label={t`No tests yet`}
                description={jt`Create tests with the ${(
                  <Code key="mb">{MB_CLI_NAME}</Code>
                )} CLI or with remote sync.`}
              />
            )
          }
          ariaLabel={t`Transform tests`}
          onRowClick={handleRowActivate}
        />
      </Card>
    </Stack>
  );
}

function getColumns(readOnly: boolean): TreeTableColumnDef<TransformTest>[] {
  const columns: TreeTableColumnDef<TransformTest>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: t`Name`,
      minWidth: 120,
      cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
    },
    {
      id: "checks",
      accessorFn: (test) => test.expectations.length,
      header: t`Checks`,
      width: 120,
      cell: ({ row }) => row.original.expectations.length,
    },
    {
      id: "last_run",
      accessorFn: (test) => test.last_run?.start_time,
      header: t`Last Run`,
      minWidth: 120,
      cell: ({ row }) =>
        row.original.last_run ? (
          <LastRunCell run={row.original.last_run} />
        ) : null,
    },
  ];

  if (readOnly) {
    return columns;
  }

  return [
    ...columns,
    {
      id: "actions",
      header: "",
      width: 48,
      cell: ({ row }) => <TransformTestMenu test={row.original} />,
    },
  ];
}

function LastRunCell({ run }: { run: TransformTestRun }) {
  return (
    <Ellipsified>
      {isFailedTestRunStatus(run.status) ? t`Failed` : t`Last run`}{" "}
      <DateTime value={run.start_time} />
    </Ellipsified>
  );
}

function TransformTestMenu({ test }: { test: TransformTest }) {
  const [runTest] = useRunTransformTestMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const handleRun = async () => {
    trackTransformTestTriggerManualRun({
      testId: test.id,
      triggeredFrom: "test_list",
    });
    const { data, error } = await runTest(test.id);
    if (error || data == null) {
      sendErrorToast(t`Failed to run the test`);
    } else if (data.status === "passed") {
      sendSuccessToast(t`Test passed`);
    } else {
      sendErrorToast(t`Test failed`);
    }
  };

  const stopPropagation = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <Menu>
      <Menu.Target>
        <MoreMenuButton
          aria-label={t`Test options`}
          onClick={stopPropagation}
        />
      </Menu.Target>
      <Menu.Dropdown onClick={stopPropagation}>
        <Menu.Item leftSection={<Icon name="play" />} onClick={handleRun}>
          {t`Run test`}
        </Menu.Item>
        <Menu.Item
          component={ForwardRefLink}
          to={Urls.transformTestRuns(test.transform_id, test.id)}
          leftSection={<Icon name="clock" />}
        >
          {t`View runs`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

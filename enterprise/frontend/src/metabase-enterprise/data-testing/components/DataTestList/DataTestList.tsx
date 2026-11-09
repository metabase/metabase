import type { Row } from "@tanstack/react-table";
import { type MouseEvent, useCallback, useMemo, useState } from "react";
import { jt, t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { ForwardRefLink } from "metabase/common/components/Link";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
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
import type { DataTestRun, DataTestType } from "metabase-types/api";

import { MB_CLI_NAME } from "../../constants";
import { getDataTestTypeDefinition } from "../../test-types";
import type {
  DataTest,
  DataTestSubjectId,
  DataTestTypeDefinition,
} from "../../types";
import { isFailedDataTestRunStatus } from "../../utils";

type DataTestListProps<K extends DataTestType> = {
  testType: K;
  subjectId: DataTestSubjectId;
};

/** The tests of one entity, such as a transform, with search and a menu to run each. */
export function DataTestList<K extends DataTestType>({
  testType,
  subjectId,
}: DataTestListProps<K>) {
  const definition = getDataTestTypeDefinition(testType);
  const {
    data: tests,
    isLoading: isLoadingTests,
    error: testsError,
  } = definition.useListTestsQuery(subjectId);
  const {
    readOnly,
    isLoading: isLoadingReadOnly,
    error: readOnlyError,
  } = definition.useReadOnly(subjectId);

  if (tests == null || isLoadingTests || isLoadingReadOnly) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoadingTests || isLoadingReadOnly}
        error={testsError ?? readOnlyError}
      />
    );
  }

  return (
    <DataTestTable definition={definition} tests={tests} readOnly={readOnly} />
  );
}

type DataTestTableProps<T extends DataTest> = {
  definition: DataTestTypeDefinition<T>;
  tests: T[];
  readOnly: boolean;
};

function DataTestTable<T extends DataTest>({
  definition,
  tests,
  readOnly,
}: DataTestTableProps<T>) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const columns = useMemo(
    () => getColumns(definition, readOnly),
    [definition, readOnly],
  );

  const handleRowActivate = useCallback(
    (row: Row<T>) => {
      navigate(definition.getTestUrl(row.original));
    },
    [definition, navigate],
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
          ariaLabel={definition.getListLabel()}
          onRowClick={handleRowActivate}
        />
      </Card>
    </Stack>
  );
}

function getColumns<T extends DataTest>(
  definition: DataTestTypeDefinition<T>,
  readOnly: boolean,
): TreeTableColumnDef<T>[] {
  const columns: TreeTableColumnDef<T>[] = [
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
      cell: ({ row }) => (
        <DataTestMenu definition={definition} test={row.original} />
      ),
    },
  ];
}

function LastRunCell({ run }: { run: DataTestRun }) {
  return (
    <Ellipsified>
      {isFailedDataTestRunStatus(run.status) ? t`Failed` : t`Last run`}{" "}
      <DateTime value={run.start_time} />
    </Ellipsified>
  );
}

type DataTestMenuProps<T extends DataTest> = {
  definition: DataTestTypeDefinition<T>;
  test: T;
};

function DataTestMenu<T extends DataTest>({
  definition,
  test,
}: DataTestMenuProps<T>) {
  const [runTest] = definition.useRunTestMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const handleRun = async () => {
    definition.trackManualRun({
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
          to={definition.getTestRunsUrl(test)}
          leftSection={<Icon name="clock" />}
        >
          {t`View runs`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

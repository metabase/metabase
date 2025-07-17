import { useMemo } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import {
  useGetDatabaseQuery,
  useGetTableDataQuery,
  useGetTableQuery,
} from "metabase/api";
import Link from "metabase/common/components/Link";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { closeNavbar } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Button, Flex, Group, Icon, Stack, Text } from "metabase/ui";
import Question from "metabase-lib/v1/Question";
import * as ML_Urls from "metabase-lib/v1/urls";

import { TableBreadcrumbs } from "../common/TableBreadcrumbs";
import { getRowCountMessage } from "../common/getRowCountMessage";
import { getTableEditUrl } from "../urls";

import S from "./BrowseTableData.module.css";
import { BrowseTableDataGrid } from "./BrowseTableDataGrid";

type BrowseTableDataProps = {
  params: {
    dbId: string;
    tableId: string;
  };
};

export const BrowseTableData = ({
  params: { dbId: dbIdParam, tableId: tableIdParam },
}: BrowseTableDataProps) => {
  const tableId = parseInt(tableIdParam, 10);
  const databaseId = parseInt(dbIdParam, 10);

  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);

  const isAdmin = useSelector(getUserIsAdmin);

  const { data: table } = useGetTableQuery({ id: tableId });
  const { data: database } = useGetDatabaseQuery({ id: databaseId });

  const { data: datasetData } = useGetTableDataQuery({
    tableId,
  });

  const exploreUrl = useMemo(() => {
    const question = Question.create({
      databaseId,
      tableId,
      metadata,
    }).setDefaultDisplay();

    return ML_Urls.getUrl(question);
  }, [databaseId, metadata, tableId]);

  useMount(() => {
    dispatch(closeNavbar());
  });

  if (!table || !datasetData) {
    // TODO: add loading and error handling
    // TODO: add loading state on data refresh
    return null;
  }
  const editUrl = getTableEditUrl(table);

  return (
    <Stack className={S.container} gap={0} data-testid="table-data-view-root">
      <Group
        justify="space-between"
        align="center"
        p="0.5rem 1rem 0.5rem 2rem"
        mih="4rem"
        bg="var(--mb-color-background)"
      >
        <TableBreadcrumbs database={database} table={table} />

        <Group gap="md">
          <Button
            leftSection={<Icon name="insight" />}
            component={Link}
            to={exploreUrl}
          >{t`Explore`}</Button>
          {isAdmin && (
            <Button
              leftSection={<Icon name="pencil" />}
              component={Link}
              to={editUrl}
            >{t`Edit`}</Button>
          )}
        </Group>
      </Group>
      <Box className={S.gridWrapper} p="1.5rem 1.5rem 0.5rem">
        <BrowseTableDataGrid data={datasetData} />
      </Box>
      <Flex
        py="0.5rem"
        px="1.5rem"
        h="2.5rem"
        justify="flex-end"
        align="center"
      >
        <Text fw="bold" size="md" c="inherit" component="span">
          {getRowCountMessage(datasetData)}
        </Text>
      </Flex>
    </Stack>
  );
};

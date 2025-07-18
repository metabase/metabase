import { useMemo } from "react";
import { t } from "ttag";

import { useGetTableDataQuery } from "metabase/api";
import Link from "metabase/common/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Button, Flex, Icon, Stack, Text } from "metabase/ui";
import Question from "metabase-lib/v1/Question";
import * as ML_Urls from "metabase-lib/v1/urls";

import { TableHeader } from "../common/TableHeader";
import { getRowCountMessage } from "../common/getRowCountMessage";
import { useCloseNavbarOnMount } from "../common/use-close-navbar-on-mount";
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
  useCloseNavbarOnMount();

  const tableId = parseInt(tableIdParam, 10);
  const databaseId = parseInt(dbIdParam, 10);

  const metadata = useSelector(getMetadata);
  const isAdmin = useSelector(getUserIsAdmin);

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

  if (!datasetData) {
    // TODO: add loading and error handling
    // TODO: add loading state on data refresh
    return null;
  }

  return (
    <Stack className={S.container} gap={0} data-testid="table-view-data-root">
      <TableHeader databaseId={databaseId} tableId={tableId}>
        <Button
          leftSection={<Icon name="insight" />}
          component={Link}
          to={exploreUrl}
        >{t`Explore`}</Button>
        {isAdmin && (
          <Button
            leftSection={<Icon name="pencil" />}
            component={Link}
            to={getTableEditUrl(tableId, databaseId)}
          >{t`Edit`}</Button>
        )}
      </TableHeader>

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

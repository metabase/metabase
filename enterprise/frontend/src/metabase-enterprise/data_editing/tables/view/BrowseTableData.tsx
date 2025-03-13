import { useMemo } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { useGetTableDataQuery, useGetTableQuery } from "metabase/api";
import Link from "metabase/core/components/Link";
import { useDispatch, useSelector } from "metabase/lib/redux";
import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip";
import { getRowCountMessage } from "metabase/query_builder/components/view/QuestionRowCount/QuestionRowCount";
import { closeNavbar } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import Question from "metabase-lib/v1/Question";
import * as ML_Urls from "metabase-lib/v1/urls";

import S from "./BrowseTableData.module.css";
import { TableDataView } from "./TableDataView";

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

  const { data: table } = useGetTableQuery({ id: tableId });

  const {
    data: datasetData,
    isLoading,
    refetch: refetchTableDataQuery,
  } = useGetTableDataQuery({
    tableId,
  });

  const editUrl = `/browse/databases/${databaseId}/tables/${tableId}/edit`;

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
    return null;
  }

  return (
    <Stack gap={0} className={S.container}>
      <Group
        justify="space-between"
        align="center"
        px="1.5rem"
        py="1rem"
        bg="var(--mb-color-background)"
      >
        <Group gap="sm">
          <Icon
            name="table"
            color="var(--mb-color-text-secondary)"
            size="1.5rem"
          />
          <Title>{table.display_name}</Title>
          <Box mt="0.4rem">
            <Icon name="info_filled" color="var(--mb-color-text-secondary)" />
          </Box>
        </Group>
        <Group gap="md">
          <Button
            leftSection={<Icon name="insight" />}
            component={Link}
            to={exploreUrl}
          >{t`Explore`}</Button>
          <Button
            leftSection={<Icon name="pencil" />}
            component={Link}
            to={editUrl}
          >{t`Edit`}</Button>
          <RunButtonWithTooltip
            iconSize={16}
            onlyIcon
            medium
            compact
            isRunning={isLoading}
            onRun={refetchTableDataQuery}
          />
        </Group>
      </Group>
      <Box className={S.gridWrapper} p="1.5rem 1.5rem 0.5rem">
        <TableDataView data={datasetData} />
      </Box>
      <Flex py="0.5rem" px="1.5rem" h="2.5rem" justify="flex-end">
        <Text fw="bold" size="md" component="span">
          {getRowCountMessage(datasetData)}
        </Text>
      </Flex>
    </Stack>
  );
};

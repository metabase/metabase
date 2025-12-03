import { useMemo } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import Question from "metabase-lib/v1/Question";
import type { DatabaseId, TableId } from "metabase-types/api";

import { useTableQuestion } from "./useTableQuestion";

interface DataTabProps {
  databaseId: DatabaseId | null;
  tableId: TableId | null;
}

export function DataTab({ databaseId, tableId }: DataTabProps) {
  const metadata = useSelector(getMetadata);
  const { question, result, isLoading, isRunning, error } = useTableQuestion({
    databaseId,
    tableId,
  });

  const rawSeries = useMemo(() => {
    if (!question || !result) {
      return null;
    }

    return [
      {
        card: question.card(),
        data: result.data,
        error: result.error,
      },
    ];
  }, [question, result]);

  const questionWithMetadata = useMemo(() => {
    if (!question) {
      return null;
    }
    return new Question(question.card(), metadata);
  }, [question, metadata]);

  if (!databaseId || !tableId) {
    return (
      <Stack h="100%" align="center" justify="center">
        <Text c="text-medium">{t`Select a table to view its data`}</Text>
      </Stack>
    );
  }

  if (isLoading || isRunning) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (error) {
    return (
      <Stack h="100%" align="center" justify="center">
        <Text c="error">{t`Error loading data`}</Text>
      </Stack>
    );
  }

  if (!rawSeries || !questionWithMetadata) {
    return (
      <Stack h="100%" align="center" justify="center">
        <Text c="text-medium">{t`No data available`}</Text>
      </Stack>
    );
  }

  return (
    <Box h="100%" className={CS.relative}>
      <Visualization
        rawSeries={rawSeries}
        metadata={questionWithMetadata.metadata()}
        className={CS.spread}
        showTitle={false}
        isDashboard={false}
        isQueryBuilder={false}
      />
    </Box>
  );
}

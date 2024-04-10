import { useMemo } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getQueryResults } from "metabase/query_builder/selectors";
import { Box, Card, Stack, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";

import type { ColumnAndSeparator } from "../../types";
import { extractQueryResults, getPreview } from "../../utils";

const PREVIEW_LINE_COLORS = ["text-dark", "text-medium", "text-light"];

interface Props {
  columnsAndSeparators: ColumnAndSeparator[];
  expressionClause: Lib.ExpressionClause;
  query: Lib.Query;
  stageIndex: number;
}

export const Preview = ({ expressionClause, query, stageIndex }: Props) => {
  const datasets = useSelector(getQueryResults);
  const queryResults = useMemo(() => {
    return extractQueryResults(datasets).slice(0, PREVIEW_LINE_COLORS.length);
  }, [datasets]);
  const values = useMemo(
    () => getPreview(query, stageIndex, expressionClause, queryResults),
    [query, stageIndex, expressionClause, queryResults],
  );

  if (values.length === 0) {
    return null;
  }

  return (
    <Stack spacing="xs">
      <Text color="text-medium" lh={1} weight="bold">{t`Preview`}</Text>

      <Card bg="bg-light" py={12} radius="xs" shadow="none" withBorder>
        {values.map((value, index) => (
          <Box key={index}>
            <Text color={PREVIEW_LINE_COLORS[index]} size="sm">
              {value}
            </Text>
          </Box>
        ))}
      </Card>
    </Stack>
  );
};

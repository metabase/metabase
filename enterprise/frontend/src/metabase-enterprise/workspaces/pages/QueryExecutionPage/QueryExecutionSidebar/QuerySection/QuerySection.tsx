import { t } from "ttag";

import { useGetNativeDatasetQuery } from "metabase/api";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Card, Stack, Title } from "metabase/ui";
import type { QueryExecution } from "metabase-types/api";

type QuerySectionProps = {
  item: QueryExecution;
};

export function QuerySection({ item }: QuerySectionProps) {
  const { data, isLoading, error } = useGetNativeDatasetQuery(item.query);

  return (
    <Stack role="region" aria-label={t`Query`}>
      <Title order={5}>{t`Query`}</Title>
      {isLoading || error != null || data == null ? (
        <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
      ) : (
        <Card p={0} shadow="none" withBorder>
          <CodeEditor value={data.query} language="sql" readOnly />
        </Card>
      )}
    </Stack>
  );
}

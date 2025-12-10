import { useMemo } from "react";
import { Link } from "react-router";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import { Button, Group, Icon, Loader, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

type SegmentPreviewProps = {
  query: Lib.Query;
};

export function SegmentPreview({ query }: SegmentPreviewProps) {
  const countQuery = useMemo(() => Lib.aggregateByCount(query, -1), [query]);

  const { data, isFetching } = useGetAdhocQueryQuery(Lib.toJsQuery(countQuery));
  const count = data?.data?.rows?.[0]?.[0];

  const previewUrl = Urls.newQuestion({
    dataset_query: Lib.toJsQuery(query),
  });

  return (
    <Group gap="md" ml="auto">
      {match({ isFetching, count })
        .with({ isFetching: true }, () => <Loader size="xs" />)
        .with({ isFetching: false, count: P.nonNullable }, ({ count }) => (
          <Text>{t`${count} rows`}</Text>
        ))
        .otherwise(() => null)}
      <Button
        component={Link}
        to={previewUrl}
        target="_blank"
        leftSection={<Icon name="share" size={16} />}
        variant="filled"
        size="compact-sm"
      >{t`Preview`}</Button>
    </Group>
  );
}

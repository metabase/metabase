import { Link } from "react-router";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import { Button, Flex, Loader, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ClauseStep } from "../ClauseStep";

type PreviewStepProps = {
  query: Lib.Query | undefined;
  stageIndex: number;
};

export function PreviewStep({ query, stageIndex }: PreviewStepProps) {
  return query ? (
    <PreviewQuery query={query} stageIndex={stageIndex} />
  ) : (
    <ClauseStep />
  );
}

type PreviewQueryProps = {
  query: Lib.Query;
  stageIndex: number;
};

function PreviewQuery({ query, stageIndex }: PreviewQueryProps) {
  const countQuery = Lib.aggregateByCount(query, stageIndex);
  const { data, isFetching } = useGetAdhocQueryQuery(
    Lib.toLegacyQuery(countQuery),
  );
  const count = data?.data?.rows?.[0]?.[0];

  const previewUrl = Urls.newQuestion({
    dataset_query: Lib.toLegacyQuery(query),
  });

  return (
    <ClauseStep>
      <Flex gap="md" align="center">
        {match({ isFetching, count })
          .with({ isFetching: true }, () => <Loader />)
          .with({ isFetching: false, count: P.nonNullable }, () => (
            <Text weight="bold">{t`${count} rows`}</Text>
          ))
          .otherwise(() => null)}
        <Button
          component={Link}
          to={previewUrl}
          target="_blank"
          variant="filled"
        >
          {t`Preview`}
        </Button>
      </Flex>
    </ClauseStep>
  );
}

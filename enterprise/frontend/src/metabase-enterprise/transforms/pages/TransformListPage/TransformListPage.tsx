import type { Location } from "history";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Group, Stack, Title } from "metabase/ui";
import { useListTransformTagsQuery } from "metabase-enterprise/api";

import { ListPageLayout } from "../TransformPageLayout";

import { CreateTransformMenu } from "./CreateTransformMenu";
import { TransformFilterList } from "./TransformFilterList";
import { TransformList } from "./TransformList";
import { getParsedParams } from "./utils";

type TransformListPageProps = {
  location: Location;
};

export function TransformListPage({ location }: TransformListPageProps) {

  const params = getParsedParams(location);
  const { data: tags = [], isLoading, error } = useListTransformTagsQuery();

  if (!tags || isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <Stack gap="xl" data-testid="transform-list-page" bg="bg-medium" h="100%" w="100%">
      <Group justify="space-between" align="start">
        <Stack gap="sm" flex={1}>
          <Title order={1}>{t`Transforms`}</Title>
          <Box>{t`Create custom tables with transforms, and run them on a schedule.`}</Box>
        </Stack>
        <CreateTransformMenu />
      </Group>
      <TransformFilterList params={params} tags={tags} />
      <TransformList params={params} />
    </Stack>
  );
}

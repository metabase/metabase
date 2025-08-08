import type { Location } from "history";
import { t } from "ttag";

import { Box, Stack, Title } from "metabase/ui";

import { RunList, type RunListParams } from "./RunList";

type RunListPageProps = {
  location: Location;
};

export function RunListPage({ location }: RunListPageProps) {
  const params = getParsedParams(location);

  return (
    <Stack gap="xl">
      <Stack gap="sm">
        <Title order={1}>{t`Runs`}</Title>
        <Box>{t`A list of when each transform ran.`}</Box>
      </Stack>
      <RunList params={params} />
    </Stack>
  );
}

function getParsedParams(location: Location): RunListParams {
  const { page, transformId } = location.query;
  return {
    page: parseNumber(page),
    transformId: parseNumber(transformId),
  };
}

function parseNumber(value: unknown) {
  return typeof value === "string" ? parseInt(value, 10) : undefined;
}

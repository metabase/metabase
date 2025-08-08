import type { Location } from "history";
import { t } from "ttag";

import { Box, Stack, Title } from "metabase/ui";

import { RunList } from "./RunList";

type RunListPageParams = {
  page: number;
};

type RunListPageProps = {
  location: Location;
};

export function RunListPage({ location }: RunListPageProps) {
  const { page } = getParsedParams(location);

  return (
    <Stack gap="xl">
      <Stack gap="sm">
        <Title order={1}>{t`Runs`}</Title>
        <Box>{t`A list of when each transform ran.`}</Box>
      </Stack>
      <RunList page={page} />
    </Stack>
  );
}

function getParsedParams(location: Location): RunListPageParams {
  const { page } = location.query;
  return {
    page: typeof page === "string" ? parseInt(page, 10) : 0,
  };
}

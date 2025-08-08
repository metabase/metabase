import type { Location } from "history";
import { t } from "ttag";

import { Box, Stack, Title } from "metabase/ui";

import { RunList } from "./RunList";
import { getParsedParams } from "./utils";

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

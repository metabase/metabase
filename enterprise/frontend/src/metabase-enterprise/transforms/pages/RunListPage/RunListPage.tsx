import type { Location } from "history";
import { t } from "ttag";

import { Box, Title } from "metabase/ui";

import { FilterList } from "./FilterList";
import { RunList } from "./RunList";
import { getParsedParams } from "./utils";

type RunListPageProps = {
  location: Location;
};

export function RunListPage({ location }: RunListPageProps) {
  const params = getParsedParams(location);

  return (
    <div>
      <Title order={1} mb="sm">{t`Runs`}</Title>
      <Box mb="xl">{t`A list of when each transform ran.`}</Box>
      <Box mb="md">
        <FilterList params={params} />
      </Box>
      <RunList params={params} />
    </div>
  );
}

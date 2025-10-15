import type { Location } from "history";
import { Link } from "react-router";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Button, Group, Icon, Stack, Title } from "metabase/ui";
import { useListTransformTagsQuery } from "metabase-enterprise/api";

import { getNewJobUrl } from "../../urls";

import { JobFilterList } from "./JobFilterList";
import { JobList } from "./JobList";
import { getParsedParams } from "./utils";

type JobListPageProps = {
  location: Location;
};

export function JobListPage({ location }: JobListPageProps) {
  const params = getParsedParams(location);
  const { data: tags = [], isLoading, error } = useListTransformTagsQuery();

  if (!tags || isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <Stack gap="xl" data-testid="job-list-page">
      <Group justify="space-between" align="start">
        <Stack gap="sm">
          <Title order={1}>{t`Jobs`}</Title>
          <Box>{t`Jobs let you run groups of transforms on a schedule.`}</Box>
        </Stack>
        <Button
          component={Link}
          to={getNewJobUrl()}
          variant="filled"
          leftSection={<Icon name="add" aria-hidden />}
        >
          {t`Create a job`}
        </Button>
      </Group>
      <JobFilterList params={params} tags={tags} />
      <JobList params={params} />
    </Stack>
  );
}

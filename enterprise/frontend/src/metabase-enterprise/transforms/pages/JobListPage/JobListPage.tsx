import { Link } from "react-router";
import { t } from "ttag";

import { Box, Button, Group, Icon, Stack, Title } from "metabase/ui";

import { getNewJobUrl } from "../../urls";

import { JobList } from "./JobList";

export function JobListPage() {
  return (
    <Stack gap="xl" data-testid="transform-job-list-page">
      <Group justify="space-between">
        <Stack gap="sm">
          <Title order={1}>{t`Jobs`}</Title>
          <Box>{t`Jobs let you run groups of transforms on a schedule.`}</Box>
        </Stack>
        <Button
          component={Link}
          to={getNewJobUrl()}
          variant="filled"
          leftSection={<Icon name="add" />}
        >
          {t`Create a job`}
        </Button>
      </Group>
      <JobList />
    </Stack>
  );
}

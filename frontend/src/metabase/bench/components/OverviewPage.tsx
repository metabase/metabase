import { Link } from "react-router";
import { useLocalStorage } from "react-use";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux/hooks";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  Box,
  Button,
  Card,
  FixedSizeIcon,
  Flex,
  Grid,
  type IconName,
  Stack,
  Text,
} from "metabase/ui";

const OverviewCard = ({
  to,
  icon,
  heading,
  body,
}: {
  to: string;
  icon: IconName;
  heading: string;
  body: string;
}) => {
  return (
    <Card
      component={Link}
      to={to}
      shadow="inset 0 0 0 1px var(--mb-color-border)"
      p="lg"
      pb="1.25rem"
      h="100%"
    >
      <Flex align="center" mb="md">
        <Flex bdrs="xl" bg="background-light" p="sm" mr="md">
          <FixedSizeIcon size={16} name={icon} c="brand" />
        </Flex>
        <Text component="h3" fz="lg" fw="bold" lh={1}>
          {heading}
        </Text>
      </Flex>
      <Text lh={1.43} c="text-secondary">
        {body}
      </Text>
    </Card>
  );
};

const initialBenchOverviewStorage = { dismissedBanner: false };

const useBenchOverviewStorage = () =>
  useLocalStorage("metabase-bench-overview", initialBenchOverviewStorage);

const OverviewBanner = () => {
  const [storage, updateStorage] = useBenchOverviewStorage();
  if (storage?.dismissedBanner) {
    return null;
  }

  return (
    <Card
      bg="color-mix(in srgb, var(--mb-color-brand) 10%, transparent)"
      p="lg"
      bdrs="lg"
      shadow="none"
    >
      <Flex>
        <Box mr="lg">
          <FixedSizeIcon size={32} name="workbench" c="brand" />
        </Box>
        <Box mt="sm">
          <Text component="h2" fz="lg" fw="bold" mb="sm" lh="sm">
            {t`Welcome to the Workbench`}
          </Text>
          <Text lh={1.43} maw={520}>
            {t`Here's where data analysts can create and manage the objects in your semantic layer for the rest of your team to use and explore.`}
          </Text>
        </Box>
        <Box m="-sm" ml="auto">
          <Button
            variant="subtle"
            size="compact-md"
            color="primary"
            leftSection={<FixedSizeIcon name="close" size={16} />}
            aria-label={t`Dismiss`}
            onClick={() =>
              updateStorage((s) => ({ ...s, dismissedBanner: true }))
            }
          />
        </Box>
      </Flex>
    </Card>
  );
};

export const OverviewPage = () => {
  const isAdmin = useSelector(getUserIsAdmin);

  return (
    <Box h="100%" bg="background-light" style={{ overflow: "auto" }}>
      <Stack mt="3rem" mb="4rem" maw="67rem" px="1rem" mx="auto" gap="3rem">
        <OverviewBanner />
        <section>
          <Text component="h2" c="text-secondary" fw="bold" mb="lg" lh="sm">
            {t`Clean up your schema`}
          </Text>
          <Grid>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <OverviewCard
                to="/bench/metadata"
                icon="table2"
                heading={t`Metadata`}
                body={t`Hide irrelevant tables, and format, describe, and add semantic types to columns.`}
              />
            </Grid.Col>
            {isAdmin && (
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <OverviewCard
                  to="/bench/transforms"
                  icon="transform"
                  heading={t`Transforms`}
                  body={t`Use SQL or python to join data and add columns. Run them on a schedule with jobs.`}
                />
              </Grid.Col>
            )}
          </Grid>
        </section>
        <section>
          <Text component="h2" c="text-secondary" fw="bold" mb="lg" lh="sm">
            {t`Model your data`}
          </Text>
          <Grid>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <OverviewCard
                to="/bench/model"
                icon="model"
                heading={t`Models`}
                body={t`Decorate your favorite tables and organize them into collections.`}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <OverviewCard
                to="/bench/metric"
                icon="metric"
                heading={t`Metrics`}
                body={t`Codify the KPIs and measures your organization keeps tabs on.`}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <OverviewCard
                to="/bench/segment"
                icon="segment"
                heading={t`Segments`}
                body={t`Define named subsets of tables that you can use as filters.`}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <OverviewCard
                to="/bench/glossary"
                icon="globe"
                heading={t`Glossary`}
                body={t`Define terms to help your team understand your data.`}
              />
            </Grid.Col>
          </Grid>
        </section>
        <section>
          <Text component="h2" c="text-secondary" fw="bold" mb="lg" lh="sm">
            {t`Keep things running smoothly`}
          </Text>
          <Grid>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <OverviewCard
                to="/bench/dependencies"
                icon="network"
                heading={t`Dependencies`}
                body={t`Use the Dependency Graph to see what's upstream and downstream of anything.`}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <OverviewCard
                to="/bench/snippet"
                icon="snippet"
                heading={t`SQL snippets`}
                body={t`Define reusable bits of SQL for your whole team to use in your queries.`}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <OverviewCard
                to="/bench/library/common.py"
                icon="code_block"
                heading={t`Python Library`}
                body={t`A customizable function library for use with your Python transforms.`}
              />
            </Grid.Col>
          </Grid>
        </section>
      </Stack>
    </Box>
  );
};

import { useMemo } from "react";
import { Link } from "react-router";
import { useLocalStorage } from "react-use";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api/database";
import { useSelector } from "metabase/lib/redux/hooks";
import { getHasNativeWrite } from "metabase/selectors/data";
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

import { getBenchNavSections } from "../constants/navigation";

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
  const { data } = useListDatabasesQuery();
  const hasNativeWrite = getHasNativeWrite(data?.data ?? []);
  const benchNavSections = useMemo(
    () => getBenchNavSections(isAdmin, hasNativeWrite),
    [isAdmin, hasNativeWrite],
  );

  return (
    <Box h="100%" bg="background-light" style={{ overflow: "auto" }}>
      <Stack mt="3rem" mb="4rem" maw="67rem" px="1rem" mx="auto" gap="3rem">
        <OverviewBanner />
        {benchNavSections
          .filter((section) => section.items.length)
          .map((section) => (
            <section key={section.id}>
              <Text component="h2" c="text-secondary" fw="bold" mb="lg" lh="sm">
                {section.getLongTitle()}
              </Text>
              <Grid>
                {section.items
                  .filter((item) => !item.nested)
                  .map((item) => (
                    <Grid.Col key={item.id} span={{ base: 12, sm: 4 }}>
                      <OverviewCard
                        to={item.url}
                        icon={item.icon}
                        heading={item.getLabel()}
                        body={item.getDescription?.() || ""}
                      />
                    </Grid.Col>
                  ))}
              </Grid>
            </section>
          ))}
      </Stack>
    </Box>
  );
};

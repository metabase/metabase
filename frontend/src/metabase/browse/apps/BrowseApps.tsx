import { IconColumns2, IconComponents, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import NoResults from "assets/img/metrics_bot.svg";
import { useApps } from "metabase/apps/hooks/use-apps";
import EmptyState from "metabase/common/components/EmptyState";
import {
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Stack,
  Tabs,
  Text,
  Title,
} from "metabase/ui";

import {
  BrowseContainer,
  BrowseHeader,
  BrowseMain,
  BrowseSection,
} from "../components/BrowseContainer.styled";

import { AppsTable } from "./AppsTable";

export function BrowseApps() {
  const apps = useApps();
  const [activeTab, setActiveTab] = useState("pages");

  return (
    <BrowseContainer>
      <BrowseHeader role="heading" data-testid="browse-metrics-header">
        <BrowseSection>
          <Flex
            w="100%"
            h="2.25rem"
            direction="row"
            justify="space-between"
            align="center"
          >
            <Title order={2} c="text-dark">
              <Group gap="sm">
                <Icon
                  size={24}
                  color="var(--mb-color-icon-primary)"
                  name="grid"
                />
                {t`Apps`}
              </Group>
            </Title>
            <Button
              variant="filled"
              component={Link}
              to="/apps/new"
              leftSection={<IconPlus size={12} />}
            >
              {activeTab === "pages" ? "New Page" : "New Component"}
            </Button>
          </Flex>
        </BrowseSection>
      </BrowseHeader>
      <BrowseMain>
        <BrowseSection>
          {apps.length > 0 ? (
            <Box>
              <Tabs
                value={activeTab}
                onChange={(value) => setActiveTab(value ?? "pages")}
                mb="md"
              >
                <Tabs.List>
                  <Tabs.Tab
                    leftSection={<IconColumns2 size={12} />}
                    value="pages"
                  >
                    {"Pages"}
                  </Tabs.Tab>
                  <Tabs.Tab
                    leftSection={<IconComponents size={12} />}
                    value="components"
                  >
                    {"Components"}
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs>
              <AppsTable apps={apps} tab={activeTab} />
            </Box>
          ) : (
            <Stack mb="lg" gap="md" w="100%">
              <AppsEmptyState />
            </Stack>
          )}
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
}

function AppsEmptyState() {
  return (
    <Flex align="center" justify="center" mih="70vh">
      <Box maw="30rem">
        <EmptyState
          title={t`No apps found`}
          message={
            <Box>
              <Text mt="sm" maw="25rem">
                {t`No apps found`}
              </Text>
              <Flex pt="md" align="center" justify="center" gap="md">
                <Button
                  component={Link}
                  to={"/apps/new"}
                  variant="filled"
                >{t`Create component`}</Button>
              </Flex>
            </Box>
          }
          illustrationElement={<img src={NoResults} />}
        />
      </Box>
    </Flex>
  );
}

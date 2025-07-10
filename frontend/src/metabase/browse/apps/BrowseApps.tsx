import { Link } from "react-router";
import { t } from "ttag";

import NoResults from "assets/img/metrics_bot.svg";
import EmptyState from "metabase/common/components/EmptyState";
import {
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import {
  BrowseContainer,
  BrowseHeader,
  BrowseMain,
  BrowseSection,
} from "../components/BrowseContainer.styled";

export function BrowseApps() {
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
          </Flex>
        </BrowseSection>
      </BrowseHeader>
      <BrowseMain>
        <BrowseSection>
          <Stack mb="lg" gap="md" w="100%">
            <AppsEmptyState />
          </Stack>
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
                  to={"/browse/apps"}
                  variant="filled"
                >{t`Create page application`}</Button>
              </Flex>
            </Box>
          }
          illustrationElement={<img src={NoResults} />}
        />
      </Box>
    </Flex>
  );
}

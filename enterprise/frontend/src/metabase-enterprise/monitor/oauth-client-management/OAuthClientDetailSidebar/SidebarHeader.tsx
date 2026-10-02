import { t } from "ttag";

import {
  SidebarNavButton,
  useCopyDetailLink,
} from "metabase/monitor/components/DetailSidebar";
import { ActionIcon, Flex, Group, Icon, Stack, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";

import { getOAuthClientName } from "../utils";

import type { SidebarHeaderProps } from "./types";

export const SidebarHeader = ({
  clientId,
  client,
  prevClientId,
  nextClientId,
  onNavigate,
  onClose,
}: SidebarHeaderProps) => {
  const handleCopyLink = useCopyDetailLink(
    Urls.monitorOAuthClientDetail(clientId),
  );

  return (
    <Stack gap="xl">
      <Flex justify="space-between" align="center">
        <Group gap="sm">
          <SidebarNavButton
            direction="previous"
            label={t`Previous client`}
            disabled={prevClientId === undefined}
            onClick={() => prevClientId && onNavigate(prevClientId)}
          />
          <SidebarNavButton
            direction="next"
            label={t`Next client`}
            disabled={nextClientId === undefined}
            onClick={() => nextClientId && onNavigate(nextClientId)}
          />
        </Group>
        <Group gap="sm">
          <ActionIcon
            aria-label={t`Copy link to clipboard`}
            size="lg"
            c="icon-primary"
            onClick={handleCopyLink}
          >
            <Icon name="link" />
          </ActionIcon>
          <ActionIcon
            aria-label={t`Close`}
            size="lg"
            c="icon-primary"
            onClick={onClose}
          >
            <Icon name="close" />
          </ActionIcon>
        </Group>
      </Flex>

      {client && (
        <Stack gap={0}>
          <Text size="sm" c="text-secondary">
            {t`OAuth client`}
          </Text>
          <Title order={3} c="text-primary">
            {getOAuthClientName(client)}
          </Title>
        </Stack>
      )}
    </Stack>
  );
};

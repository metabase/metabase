import type { PropsWithChildren } from "react";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import {
  Alert,
  Box,
  Flex,
  Group,
  Icon,
  type IconName,
  Stack,
  Text,
} from "metabase/ui";

import S from "./EmbeddingSettings.module.css";
import { type EmbeddingSettingKey, EmbeddingToggle } from "./EmbeddingToggle";

type LinkItem = { icon: IconName; title: string; href: string };

export function EmbeddingSettingsCard({
  children,
  title,
  description,
  settingKey,
  dependentSettingKeys,
  isFeatureEnabled = true,
  links,
  rightSideContent,
  alertInfoText,
  actionButton,
  testId,
}: PropsWithChildren<{
  title: string;
  description: string;
  settingKey: EmbeddingSettingKey;
  dependentSettingKeys?: EmbeddingSettingKey[];
  isFeatureEnabled?: boolean;
  links?: LinkItem[];
  rightSideContent?: React.ReactNode;
  alertInfoText?: React.ReactNode;
  actionButton?: React.ReactNode;
  testId?: string;
}>) {
  const hasLinksContent = links && links.length > 0;

  return (
    <Flex direction="column" className={S.SectionCard} data-testid={testId}>
      <Stack gap="xs" px="xl" py="lg">
        <Text fw={600} c="text-primary" fz="h4">
          {title}
        </Text>

        <Text c="text-secondary" lh="lg" mb="md" maw="38rem">
          {description}
        </Text>

        <Group justify="space-between" align="center">
          <EmbeddingToggle
            settingKey={settingKey}
            dependentSettingKeys={dependentSettingKeys}
            labelPosition="right"
            disabled={!isFeatureEnabled}
            aria-label={`${title} toggle`}
          />
          {rightSideContent}
        </Group>

        {alertInfoText && (
          <Alert
            data-testid="sdk-settings-alert-info"
            mt="md"
            bg="background-secondary"
            bd="1px solid var(--mb-color-border)"
          >
            <Flex gap="sm">
              <Box>
                <Icon c="text-secondary" name="info" mt="2px" />
              </Box>

              <Text c="text-primary" lh="lg">
                {alertInfoText}
              </Text>
            </Flex>
          </Alert>
        )}
      </Stack>

      {children}

      {(hasLinksContent || actionButton) && (
        <Group
          px="xl"
          className={S.CardLinksSection}
          h="3.5rem"
          justify="space-between"
        >
          <Group gap="xl">
            {links?.map((link, index) => (
              <ExternalLink key={index} href={link.href}>
                <Group gap="sm" fw="bold">
                  <Icon name={link.icon} size={14} aria-hidden />
                  <span>{link.title}</span>
                </Group>
              </ExternalLink>
            ))}
          </Group>

          {actionButton}
        </Group>
      )}
    </Flex>
  );
}

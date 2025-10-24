import ExternalLink from "metabase/common/components/ExternalLink";
import {
  Alert,
  Box,
  Flex,
  Group,
  Icon,
  type IconName,
  Stack,
  Text,
  type TextProps,
} from "metabase/ui";

import S from "./EmbeddingSettings.module.css";
import { EmbeddingToggle } from "./EmbeddingToggle";

type LinkItem = { icon: IconName; title: string; href: string };

export function EmbeddingSettingsCard({
  title,
  titleProps,
  description,
  settingKey,
  isFeatureEnabled = true,
  links,
  rightSideContent,
  alertInfoText,
  actionButton,
  testId,
}: {
  title: string;
  titleProps?: TextProps;
  description: string;
  settingKey:
    | "enable-embedding-sdk"
    | "enable-embedding-simple"
    | "enable-embedding-static"
    | "enable-embedding-interactive";
  isFeatureEnabled?: boolean;
  links?: LinkItem[];
  rightSideContent?: React.ReactNode;
  alertInfoText?: React.ReactNode;
  actionButton?: React.ReactNode;
  testId?: string;
}) {
  const hasLinksContent = links && links.length > 0;

  return (
    <Flex direction="column" className={S.SectionCard} data-testid={testId}>
      <Stack gap="xs" px="xl" py="lg">
        <Text fw={600} c="text-dark" fz="h4" {...titleProps}>
          {title}
        </Text>

        <Text c="var(--mb-color-text-secondary)" lh="lg" mb="md">
          {description}
        </Text>

        <Group justify="space-between" align="center">
          <EmbeddingToggle
            settingKey={settingKey}
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
            bg="bg-light"
            bd="1px solid var(--mb-color-border)"
          >
            <Flex gap="sm">
              <Box>
                <Icon
                  color="var(--mb-color-text-secondary)"
                  name="info"
                  mt="2px"
                />
              </Box>

              <Text c="text-primary" lh="lg">
                {alertInfoText}
              </Text>
            </Flex>
          </Alert>
        )}
      </Stack>

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

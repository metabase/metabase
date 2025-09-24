import { useMemo } from "react";
import { Link } from "react-router";
import { match } from "ts-pattern";

import ExternalLink from "metabase/common/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import {
  Box,
  Button,
  Flex,
  Group,
  Icon,
  type IconName,
  Stack,
  Text,
} from "metabase/ui";

import { EmbeddingToggle } from "../../EmbeddingToggle";
import S from "../EmbeddingSdkSettings.module.css";

type LinkItem =
  | { type: "link"; icon: IconName; title: string; href: string }
  | { type: "button"; title: string; to: string };

export function SdkSettingsCard({
  title,
  description,
  settingKey,
  isFeatureEnabled = true,
  links,
  rightSideContent,
}: {
  title: string;
  description: string;
  settingKey: "enable-embedding-sdk" | "enable-embedding-simple";
  isFeatureEnabled?: boolean;
  links?: LinkItem[];
  rightSideContent?: React.ReactNode;
}) {
  const hasButton = useMemo(() => {
    return links?.some((link) => link.type === "button");
  }, [links]);

  const hasLinksContent = links && links.length > 0;

  const renderLink = (linkItem: LinkItem, index: number) =>
    match(linkItem)
      .with({ type: "button" }, ({ to, title }) => (
        <Link key={index} to={to} className={CS.cursorPointer}>
          <Button variant="brand" size="sm">
            {title}
          </Button>
        </Link>
      ))
      .with({ type: "link" }, ({ icon, title, href }) => (
        <ExternalLink key={index} href={href}>
          <Group gap="sm" fw="bold">
            <Icon name={icon} size={14} />
            <span>{title}</span>
          </Group>
        </ExternalLink>
      ))
      .exhaustive();

  return (
    <Flex
      direction="column"
      className={S.SectionCard}
      data-testid="sdk-setting-card"
    >
      <Stack gap="sm" px="xl" py="lg">
        <Text fz="h3" fw={600} c="text-dark">
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
      </Stack>

      {hasLinksContent && (
        <Box
          px="xl"
          py={hasButton ? "0.7rem" : "md"}
          className={S.CardLinksSection}
        >
          <Group gap="xl">{links?.map(renderLink)}</Group>
        </Box>
      )}
    </Flex>
  );
}

import { Link } from "react-router";

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

interface LinkItem {
  type: "link" | "button";
  icon?: IconName;
  title: string;
  href?: string;
  to?: string;
}

export function SdkSettingsCard({
  title,
  description,
  settingKey,
  isFeatureEnabled = true,
  links,
  customLinksSection,
  rightSideContent,
}: {
  title: string;
  description: string;
  settingKey: "enable-embedding-sdk" | "enable-embedding-simple";
  isFeatureEnabled?: boolean;
  links?: LinkItem[];
  customLinksSection?: React.ReactNode;
  rightSideContent?: React.ReactNode;
}) {
  const renderLink = (linkItem: LinkItem, index: number) => {
    const { type, icon, title, href, to } = linkItem;

    if (type === "button" && to) {
      return (
        <Link to={to} className={CS.cursorPointer}>
          <Button variant="brand" size="sm">
            {title}
          </Button>
        </Link>
      );
    }

    if (type === "link" && icon) {
      return (
        <ExternalLink key={index} href={href}>
          <Group gap="sm" fw="bold">
            <Icon name={icon} size={14} />
            <span>{title}</span>
          </Group>
        </ExternalLink>
      );
    }

    return null;
  };

  const hasLinksContent = links?.length || customLinksSection;

  return (
    <Flex direction="column" className={S.SectionCard}>
      <Stack gap="xs" px="xl" py="lg">
        <Text fz="h3" fw={600} c="text-dark">
          {title}
        </Text>

        <Text c="var(--mb-color-text-secondary)" lh="lg" mb="sm">
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
        <Box px="xl" py="md" className={S.CardLinksSection}>
          {customLinksSection || (
            <Group gap="md">{links?.map(renderLink)}</Group>
          )}
        </Box>
      )}
    </Flex>
  );
}

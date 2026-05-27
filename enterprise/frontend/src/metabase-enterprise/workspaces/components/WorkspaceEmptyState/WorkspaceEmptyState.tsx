import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import {
  Box,
  Card,
  FixedSizeIcon,
  Group,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import S from "./WorkspaceEmptyState.module.css";

type WorkspaceEmptyStateProps = {
  description: ReactNode;
  children?: ReactNode;
};

export function WorkspaceEmptyState({
  description,
  children,
}: WorkspaceEmptyStateProps) {
  const { url: fileBasedDevDocsUrl, showMetabaseLinks: showFileBasedDevLink } =
    useDocsUrl("ai/file-based-development");
  const { url: remoteSyncDocsUrl, showMetabaseLinks: showRemoteSyncLink } =
    useDocsUrl("installation-and-operation/remote-sync");

  return (
    <Card p="xl" maw="40rem" mx="auto" shadow="none" withBorder>
      <Box p="md">
        <Title
          order={3}
          mb="sm"
        >{t`Isolated spaces for agents and developers`}</Title>
        <Text c="text-secondary" mb="md">
          {description}
        </Text>
        {children}
        {(showFileBasedDevLink || showRemoteSyncLink) && (
          <Group pt="md" gap="sm" align="stretch">
            {showFileBasedDevLink && (
              <DocsLink
                title={t`File-based development`}
                description={t`How to use the CLI to develop content locally.`}
                link={fileBasedDevDocsUrl}
              />
            )}
            {showRemoteSyncLink && (
              <DocsLink
                title={t`Using remote sync`}
                description={t`How to sync and review instance content with git.`}
                link={remoteSyncDocsUrl}
              />
            )}
          </Group>
        )}
      </Box>
    </Card>
  );
}

type DocsLinkProps = {
  title: string;
  description: string;
  link: string;
};

function DocsLink({ title, description, link }: DocsLinkProps) {
  return (
    <Box
      className={S.docsLink}
      component={Link}
      to={link}
      target="_blank"
      rel="noreferrer"
      p="md"
      bdrs="md"
      flex="1"
      miw="16rem"
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <FixedSizeIcon c="brand" name="reference" />
        <Stack gap="xs">
          <Title order={5}>{title}</Title>
          <Box c="text-secondary">{description}</Box>
        </Stack>
      </Group>
    </Box>
  );
}

import type { ReactNode } from "react";
import { t } from "ttag";

import { useDocsUrl, useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { Link } from "metabase/router";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  Anchor,
  Box,
  Card,
  Divider,
  FixedSizeIcon,
  Group,
  List,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Database } from "metabase-types/api";

import { getEligibleDatabases } from "../../../utils";
import { NewWorkspaceButton } from "../NewWorkspaceButton";

import S from "./WorkspaceEmptyState.module.css";

export type WorkspaceEmptyStateProps = {
  databases: Database[];
};

export function WorkspaceEmptyState({ databases }: WorkspaceEmptyStateProps) {
  const applicationName = useSelector(getApplicationName);

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
        >{t`Use Workspaces to develop your semantic layer safely`}</Title>
        <Text mb="lg">
          {t`While in a workspace, ${applicationName} will remap tables created by transforms to an isolated schema, letting you test and build on top of these tables. When you're ready, use remote sync to pull your changes into your production ${applicationName}.`}
        </Text>
        <CreateWorkspaceSection databases={databases} />
        {(showFileBasedDevLink || showRemoteSyncLink) && (
          <>
            <Divider my="xl" />
            <Group gap="sm" align="stretch">
              {showFileBasedDevLink && (
                <DocsLink
                  title={t`Agent-driven development`}
                  description={t`How to use the CLI to develop content locally.`}
                  link={fileBasedDevDocsUrl}
                />
              )}
              {showRemoteSyncLink && (
                <DocsLink
                  title={t`Using remote sync`}
                  description={t`How to sync and review ${applicationName} content with git.`}
                  link={remoteSyncDocsUrl}
                />
              )}
            </Group>
          </>
        )}
      </Box>
    </Card>
  );
}

type CreateWorkspaceSectionProps = {
  databases: Database[];
};

function CreateWorkspaceSection({ databases }: CreateWorkspaceSectionProps) {
  const isRemoteSyncEnabled = useSetting("remote-sync-enabled") ?? false;
  const hasEligibleDatabase = getEligibleDatabases(databases).length > 0;

  if (!hasEligibleDatabase || !isRemoteSyncEnabled) {
    return (
      <CreateWorkspaceErrors
        hasEligibleDatabase={hasEligibleDatabase}
        isRemoteSyncEnabled={isRemoteSyncEnabled}
      />
    );
  }

  return <NewWorkspaceButton databases={databases} primary />;
}

type CreateWorkspaceErrorsProps = {
  hasEligibleDatabase: boolean;
  isRemoteSyncEnabled: boolean;
};

function CreateWorkspaceErrors({
  hasEligibleDatabase,
  isRemoteSyncEnabled,
}: CreateWorkspaceErrorsProps) {
  const errors: ReactNode[] = [];
  if (!hasEligibleDatabase) {
    errors.push(
      <Anchor key="databases" component={Link} to={Urls.viewDatabases()}>
        {t`Enable workspaces on at least one database`}
      </Anchor>,
    );
  }
  if (!isRemoteSyncEnabled) {
    errors.push(
      <Anchor key="remote-sync" component={Link} to={Urls.remoteSyncSettings()}>
        {t`Set up remote sync`}
      </Anchor>,
    );
  }

  return (
    <Stack gap="sm">
      <Text>{t`To create a workspace, you need to:`}</Text>
      <List>
        {errors.map((error, index) => (
          <List.Item key={index}>{error}</List.Item>
        ))}
      </List>
    </Stack>
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
        <FixedSizeIcon c="core-brand" name="reference" />
        <Stack gap="xs">
          <Title order={5}>{title}</Title>
          <Box c="text-secondary">{description}</Box>
        </Stack>
      </Group>
    </Box>
  );
}

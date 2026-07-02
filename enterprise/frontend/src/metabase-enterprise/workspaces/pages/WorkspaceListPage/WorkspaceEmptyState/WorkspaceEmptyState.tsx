import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  Box,
  Button,
  Card,
  Divider,
  FixedSizeIcon,
  Group,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { Database } from "metabase-types/api";

import { trackWorkspaceSetupButtonClicked } from "../../../analytics";
import { NewWorkspaceButton } from "../NewWorkspaceButton";
import { SetupWorkspaceModal } from "../SetupWorkspaceModal";

import S from "./WorkspaceEmptyState.module.css";

export type WorkspaceEmptyStateProps = {
  databases: Database[];
};

export function WorkspaceEmptyState({ databases }: WorkspaceEmptyStateProps) {
  const [isSetupOpen, { open: openSetup, close: closeSetup }] =
    useDisclosure(false);
  const applicationName = useSelector(getApplicationName);

  const { url: fileBasedDevDocsUrl, showMetabaseLinks: showFileBasedDevLink } =
    useDocsUrl("ai/file-based-development");
  const { url: remoteSyncDocsUrl, showMetabaseLinks: showRemoteSyncLink } =
    useDocsUrl("installation-and-operation/remote-sync");

  const handleSetupClick = () => {
    trackWorkspaceSetupButtonClicked();
    openSetup();
  };

  return (
    <>
      <Card p="xl" maw="40rem" mx="auto" shadow="none" withBorder>
        <Box p="md">
          <Title
            order={3}
            mb="sm"
          >{t`Use Workspaces to develop your semantic layer safely`}</Title>
          <Text mb="md">
            {t`While in a workspace, ${applicationName} will remap tables created by transforms to an isolated schema, letting you test and build on top of these tables. When you're ready, use remote sync to pull your changes into your production ${applicationName}.`}
          </Text>
          <Text mb="lg">
            {t`If this is your production instance, create and download a workspace config here to use in a development instance.`}{" "}
            {t`If you're using this ${applicationName} instance for development, you can upload a workspace config file to put this instance into that workspace.`}
          </Text>
          <Group gap="md">
            <NewWorkspaceButton databases={databases} primary />
            <Button variant="default" onClick={handleSetupClick}>
              {t`Upload a workspace config`}
            </Button>
          </Group>
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
      <SetupWorkspaceModal opened={isSetupOpen} onClose={closeSetup} />
    </>
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

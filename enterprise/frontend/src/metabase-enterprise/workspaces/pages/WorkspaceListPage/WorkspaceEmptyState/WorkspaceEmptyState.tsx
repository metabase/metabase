import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/redux";
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
import * as Urls from "metabase/urls";
import type { Workspace } from "metabase-types/api";

import { trackWorkspaceSetupButtonClicked } from "../../../analytics";
import { canManageWorkspaceInstance } from "../../../selectors";
import { NewWorkspaceModal } from "../NewWorkspaceModal";
import { SetupWorkspaceModal } from "../SetupWorkspaceModal";

import S from "./WorkspaceEmptyState.module.css";

export function WorkspaceEmptyState() {
  const [isCreateOpen, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
  const [isSetupOpen, { open: openSetup, close: closeSetup }] =
    useDisclosure(false);
  const dispatch = useDispatch();
  const canManageInstance = useSelector(canManageWorkspaceInstance);
  const applicationName = useSelector(getApplicationName);

  const { url: fileBasedDevDocsUrl, showMetabaseLinks: showFileBasedDevLink } =
    useDocsUrl("ai/file-based-development");
  const { url: remoteSyncDocsUrl, showMetabaseLinks: showRemoteSyncLink } =
    useDocsUrl("installation-and-operation/remote-sync");

  const handleCreate = (workspace: Workspace) => {
    closeCreate();
    dispatch(push(Urls.workspace(workspace.id)));
  };

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
          >{t`Workspaces let you develop your semantic layer without affecting your production setup`}</Title>
          <Text mb="md">
            {t` While in a workspace, ${applicationName} will remap tables created by transforms to an isolated schema. You can build measures, dashboards, and more on top of these remapped tables. Once you're happy with your changes, use remote sync to pull your changes into your production ${applicationName}.`}
          </Text>
          <Stack gap="lg" pb="xl">
            <Stack gap="xs" align="flex-start">
              <Title
                order={5}
              >{t`Is this your production ${applicationName}?`}</Title>
              <Text c="text-secondary">
                {t`Create a workspace config that you can download and use to set up a workspace in a development instance.`}
              </Text>
              <Button variant="filled" mt="xs" onClick={openCreate}>
                {t`Create a workspace`}
              </Button>
            </Stack>
            {canManageInstance && (
              <>
                <Divider />
                <Stack gap="xs" align="flex-start">
                  <Title order={5}>{t`Set up a workspace`}</Title>
                  <Text c="text-secondary">
                    {t`If you're using this ${applicationName} for development, you can upload a workspace config file to put this ${applicationName} into that workspace.`}
                  </Text>
                  <Button variant="default" mt="xs" onClick={handleSetupClick}>
                    {t`Upload a workspace config`}
                  </Button>
                </Stack>
              </>
            )}
          </Stack>
          {(showFileBasedDevLink || showRemoteSyncLink) && (
            <Group pt="md" gap="sm" align="stretch">
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
                  description={t`How to sync and review instance content with git.`}
                  link={remoteSyncDocsUrl}
                />
              )}
            </Group>
          )}
        </Box>
      </Card>
      <NewWorkspaceModal
        opened={isCreateOpen}
        onCreate={handleCreate}
        onClose={closeCreate}
      />
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
        <FixedSizeIcon c="brand" name="reference" />
        <Stack gap="xs">
          <Title order={5}>{title}</Title>
          <Box c="text-secondary">{description}</Box>
        </Stack>
      </Group>
    </Box>
  );
}

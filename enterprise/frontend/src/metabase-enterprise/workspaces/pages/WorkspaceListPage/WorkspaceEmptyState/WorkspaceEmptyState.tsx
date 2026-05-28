import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { jt, t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import {
  Anchor,
  Box,
  Button,
  Card,
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

  const createButton = (
    <Button key="create" variant="filled" onClick={openCreate}>
      {t`Create a workspace`}
    </Button>
  );

  const setupButton = (
    <Anchor
      key="setup"
      role="button"
      component="button"
      onClick={handleSetupClick}
    >
      {t`upload a workspace config`}
    </Anchor>
  );

  return (
    <>
      <Card p="xl" maw="40rem" mx="auto" shadow="none" withBorder>
        <Box p="md">
          <Title
            order={3}
            mb="sm"
          >{t`Isolated spaces for agents and developers`}</Title>
          <Text mb="md">
            {t`Develop transforms and the semantic layer without touching production tables. Each workspace gets its own schema and database user in the warehouses you pick.`}
          </Text>
          <Stack gap="sm" pb="xl">
            <Box>{createButton}</Box>
            {canManageInstance && (
              <Box>{jt`or ${setupButton} generated from your production instance to put this development instance into a workspace.`}</Box>
            )}
          </Stack>
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

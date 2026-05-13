import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import {
  Box,
  Button,
  Card,
  Center,
  FixedSizeIcon,
  Group,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Workspace } from "metabase-types/api";

import { NewWorkspaceModal } from "../NewWorkspaceModal";

import S from "./WorkspaceEmptyState.module.css";

export function WorkspaceEmptyState() {
  const [opened, { open, close }] = useDisclosure(false);
  const dispatch = useDispatch();
  const { url: fileBasedDevDocsUrl, showMetabaseLinks: showFileBasedDevLink } =
    useDocsUrl("ai/file-based-development");
  const { url: remoteSyncDocsUrl, showMetabaseLinks: showRemoteSyncLink } =
    useDocsUrl("installation-and-operation/remote-sync");

  const handleCreate = (workspace: Workspace) => {
    close();
    dispatch(push(Urls.workspace(workspace.id)));
  };

  return (
    <Center h="100%" pb="7rem">
      <Card p="xl" maw="40rem" shadow="none" withBorder>
        <Box p="md">
          <Title
            order={3}
            mb="sm"
          >{t`Isolated spaces for agents and developers`}</Title>
          <Text c="text-secondary" mb="sm">
            {t`Develop and run transforms, and build your semantic layer without touching your production tables.`}
          </Text>
          <Text c="text-secondary" mb="md">
            {
              // eslint-disable-next-line metabase/no-literal-metabase-strings -- referring to the product name is intentional
              t`Create a workspace here, or with Metabase’s CLI. That will set up an isolated sandbox with a dedicated schema and database user in the data warehouse(s) you choose.`
            }
          </Text>
          <Box pb="xl">
            <Button variant="filled" onClick={open}>
              {t`Create a workspace`}
            </Button>
          </Box>
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
                  description={
                    // eslint-disable-next-line metabase/no-literal-metabase-strings -- referring to the product name is intentional
                    t`How to sync and review Metabase content with git.`
                  }
                  link={remoteSyncDocsUrl}
                />
              )}
            </Group>
          )}
        </Box>
        <NewWorkspaceModal
          opened={opened}
          onCreate={handleCreate}
          onClose={close}
        />
      </Card>
    </Center>
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
      flex="1 1 auto"
      miw="15rem"
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

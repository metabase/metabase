import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import type { ContentStudioSection } from "metabase/content-studio/app/pages/ContentStudioLayout";
import { Box, Button, Group, Icon, Stack, Text, Title } from "metabase/ui";

import { getSectionIcon, getSectionTitle } from "../../content-target";
import { useContentStudioScope } from "../../scope";
import { CheckOutBranchModal } from "../CheckOutBranchModal";

const REMOTE_SYNC_SETTINGS_PATH = "/admin/settings/remote-sync";

type SectionExplanation = {
  section: ContentStudioSection;
  description: string;
};

function getSectionExplanations(): SectionExplanation[] {
  return [
    {
      section: "collections",
      description: t`The collections you sync to git, with the questions, dashboards, and models inside them.`,
    },
    {
      section: "transforms",
      description: t`Transforms travel with your synced content once transform sync is on.`,
    },
    {
      section: "snippets",
      description: t`SQL snippets are synced along with the Library.`,
    },
  ];
}

/**
 * What Content Studio shows an instance that syncs with git but has nothing to
 * show yet: nothing synced and no branch checked out.
 */
export function ContentStudioOnboarding() {
  const { setScope } = useContentStudioScope();
  const [
    isCheckOutModalOpen,
    { open: openCheckOutModal, close: closeCheckOutModal },
  ] = useDisclosure(false);

  return (
    <Stack gap="xl" maw="40rem" data-testid="content-studio-onboarding">
      <Stack gap="sm">
        <Title order={3}>{t`Nothing is synced yet`}</Title>
        <Text c="text-secondary">
          {t`Content Studio is where you work on the content that lives in your git repository — on the main branch, or on a branch you check out and sync separately.`}
        </Text>
      </Stack>

      <Stack gap="md">
        {getSectionExplanations().map(({ section, description }) => (
          <Group key={section} gap="md" align="flex-start" wrap="nowrap">
            <Box pt="0.15rem">
              <Icon name={getSectionIcon(section)} c="brand" />
            </Box>
            <Stack gap={2}>
              <Text fw="bold">{getSectionTitle(section)}</Text>
              <Text c="text-secondary">{description}</Text>
            </Stack>
          </Group>
        ))}
      </Stack>

      <Group gap="sm">
        <Button
          component={Link}
          to={REMOTE_SYNC_SETTINGS_PATH}
          variant="filled"
        >
          {t`Choose collections to sync`}
        </Button>
        <Button onClick={openCheckOutModal}>{t`Check out a branch`}</Button>
      </Group>

      {isCheckOutModalOpen && (
        <CheckOutBranchModal
          onClose={closeCheckOutModal}
          onCheckedOut={setScope}
        />
      )}
    </Stack>
  );
}

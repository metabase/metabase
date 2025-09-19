import { useState } from "react";
import Link from "react-router/lib/Link";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Button, Flex, Icon, type IconName, Text } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import { useIsCollectionDirtyQuery } from "../api/git-sync";

import { PushChangesModal } from "./PushChangesModal";

interface SyncStatusBannerProps {
  collection: Collection;
}

export const SyncStatusBanner = ({ collection }: SyncStatusBannerProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const isAdmin = useSelector(getUserIsAdmin);
  const isGitSyncConfigured = useSetting("remote-sync-configured");
  const isGitSyncEnabled = useSetting("remote-sync-enabled");
  const syncType = useSetting("remote-sync-type");

  const { data: isDirtyData, isLoading: isDirtyLoading } =
    useIsCollectionDirtyQuery(
      { collectionId: collection.id },
      {
        skip:
          !isGitSyncConfigured || !isGitSyncEnabled || syncType !== "export",
        refetchOnMountOrArgChange: true,
        refetchOnFocus: true,
      },
    );

  const hasUnsyncedChanges = isDirtyData?.is_dirty || false;

  if (
    !isGitSyncConfigured ||
    !isGitSyncEnabled ||
    collection?.type !== "remote-synced"
  ) {
    return null;
  }

  const isImportMode = syncType === "import";
  const isExportMode = syncType === "export";

  if (isExportMode && isDirtyLoading) {
    return null;
  }

  let bannerText: string;
  let bannerIcon: IconName;

  if (isImportMode) {
    bannerText = t`This collection syncs from Git and can't be edited here`;
    bannerIcon = "lock";
  } else if (isExportMode && hasUnsyncedChanges) {
    bannerText = t`You have changes that haven't been pushed to Git`;
    bannerIcon = "upload";
  } else if (isExportMode) {
    bannerText = t`Everything is synced with Git`;
    bannerIcon = "check";
  } else {
    bannerText = t`Connected to Git`;
    bannerIcon = "sync";
  }

  return (
    <>
      <Box px="md" py="sm" bg="brand" w="100%" data-testid="remote-sync-banner">
        <Flex justify="space-between" align="center" c="white">
          <Flex align="center" gap="md">
            <Icon name={bannerIcon} size={16} c="white" />
            <Text c="white" fw={500}>
              {bannerText}
            </Text>
          </Flex>
          <Flex gap="sm" align="center">
            {isExportMode && hasUnsyncedChanges && collection.can_write && (
              <Button
                leftSection={<Icon name="upload" size={14} />}
                variant="white"
                size="xs"
                onClick={() => setIsModalOpen(true)}
              >
                {t`Push`}
              </Button>
            )}
            {isAdmin && (
              <Button
                leftSection={<Icon name="gear" size={14} />}
                variant="white"
                size="xs"
                component={Link}
                to="/admin/settings/remote-sync"
              >
                {t`Settings`}
              </Button>
            )}
          </Flex>
        </Flex>
      </Box>
      {isModalOpen && (
        <PushChangesModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          collection={collection}
        />
      )}
    </>
  );
};

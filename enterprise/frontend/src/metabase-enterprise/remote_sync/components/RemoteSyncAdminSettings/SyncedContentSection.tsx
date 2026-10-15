import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { Anchor, Box, Flex, Icon, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import S from "../CollectionSyncList/CollectionSyncList.module.css";
import { SyncListRow } from "../SyncListRow";

import { RemoteSyncSettingsSection } from "./RemoteSyncSettingsSection";

export const SyncedContentSection = () => {
  const isTransformsEnabled = PLUGIN_TRANSFORMS.isEnabled;

  return (
    <RemoteSyncSettingsSection
      title={t`Synced content`}
      description={
        isTransformsEnabled
          ? t`Library and Transforms are always synced with git.`
          : t`Library is always synced with git.`
      }
    >
      <Stack gap="lg">
        <Box className={S.collectionSyncList}>
          <SyncedContentRow
            icon="folder"
            label={t`Library`}
            to={Urls.dataStudioLibrary()}
          />
          {isTransformsEnabled && (
            <SyncedContentRow
              icon="transform"
              label={t`Transforms`}
              to={Urls.transformList()}
            />
          )}
        </Box>
        <Flex align="center" gap="sm">
          <Icon name="info" c="text-secondary" />
          <Text c="text-secondary">
            {t`Other collections stay on this instance and aren't synced.`}
          </Text>
        </Flex>
      </Stack>
    </RemoteSyncSettingsSection>
  );
};

type SyncedContentRowProps = {
  icon: IconName;
  label: string;
  to: string;
};

const SyncedContentRow = ({ icon, label, to }: SyncedContentRowProps) => (
  <SyncListRow icon={icon} label={label}>
    <Anchor
      component={Link}
      to={to}
      target="_blank"
      fw="bold"
      aria-label={t`Open ${label}`}
    >
      <Flex align="center" gap="xs">
        {t`Open`}
        <Icon name="external" />
      </Flex>
    </Anchor>
  </SyncListRow>
);

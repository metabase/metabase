import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { Anchor, Group, Icon, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import { SyncList, SyncListRow } from "../SyncList";

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
        <SyncList>
          <SyncedContentRow
            label={t`Library`}
            icon="folder"
            to={Urls.dataStudioLibrary()}
          />
          {isTransformsEnabled && (
            <SyncedContentRow
              label={t`Transforms`}
              icon="transform"
              to={Urls.transformList()}
            />
          )}
        </SyncList>
        <Group gap="sm">
          <Icon name="info" c="text-secondary" />
          <Text c="text-secondary">
            {t`Other collections stay on this instance and aren't synced.`}
          </Text>
        </Group>
      </Stack>
    </RemoteSyncSettingsSection>
  );
};

type SyncedContentRowProps = {
  label: string;
  icon: IconName;
  to: string;
};

const SyncedContentRow = ({ label, icon, to }: SyncedContentRowProps) => (
  <SyncListRow label={label} icon={icon}>
    <Anchor
      component={Link}
      to={to}
      target="_blank"
      fw="bold"
      aria-label={t`Open ${label}`}
    >
      <Group gap="xs">
        {t`Open`}
        <Icon name="external" />
      </Group>
    </Anchor>
  </SyncListRow>
);

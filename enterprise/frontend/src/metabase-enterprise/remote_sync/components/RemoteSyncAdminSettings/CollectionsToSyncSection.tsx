import { t } from "ttag";

import { useSetting } from "metabase/settings";
import { Stack, Text } from "metabase/ui";

import { SharedTenantCollectionsList } from "../SharedTenantCollectionsList";
import { TopLevelCollectionsList } from "../TopLevelCollectionsList";

import { RemoteSyncSettingsSection } from "./RemoteSyncSettingsSection";

export const CollectionsToSyncSection = () => {
  const useTenants = useSetting("use-tenants");

  return (
    <RemoteSyncSettingsSection
      title={t`Collections to sync`}
      description={t`Choose which collections to sync with git.`}
    >
      <Stack gap="xl">
        <TopLevelCollectionsList />
        {useTenants && (
          <>
            <Text fw={700} size="md" lh="1rem">
              {t`Shared collections`}
            </Text>
            <SharedTenantCollectionsList />
          </>
        )}
      </Stack>
    </RemoteSyncSettingsSection>
  );
};

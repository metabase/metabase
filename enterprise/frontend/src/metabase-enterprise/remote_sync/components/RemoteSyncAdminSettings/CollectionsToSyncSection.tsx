import { useFormikContext } from "formik";
import { useMemo } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/settings";
import { Button, Group, Stack, Text, Title } from "metabase/ui";
import type { RemoteSyncSettingsFormState } from "metabase-enterprise/remote_sync/types";
import type { RemoteSyncDependencyFailure } from "metabase-types/api";

import {
  getBlockedCollectionIds,
  getCollectionIdsBlockedByPersonalContent,
  getRequiredCollectionIds,
  requiresLibrarySync,
} from "../../utils";
import { SharedTenantCollectionsList } from "../SharedTenantCollectionsList";
import { TopLevelCollectionsList } from "../TopLevelCollectionsList";

import { RemoteSyncSettingsSection } from "./RemoteSyncSettingsSection";

interface CollectionsToSyncSectionProps {
  /**
   * Why the last save was refused, one entry per collection. This section is the one place that
   * reads the failure payload — the lists below take plain id sets — so anything else derived from
   * it (`getRequiredCollections`, `requiresLibrarySync`) belongs here too.
   */
  dependencyFailures?: RemoteSyncDependencyFailure[];
}

export const CollectionsToSyncSection = ({
  dependencyFailures,
}: CollectionsToSyncSectionProps = {}) => {
  const useTenants = useSetting("use-tenants");
  const { values, setFieldValue } = useFormikContext<
    Partial<RemoteSyncSettingsFormState> &
      Pick<RemoteSyncSettingsFormState, "collections">
  >();

  const blockedCollectionIds = useMemo(
    () => getBlockedCollectionIds(dependencyFailures ?? []),
    [dependencyFailures],
  );

  const requiredCollectionIds = useMemo(
    () => getRequiredCollectionIds(dependencyFailures ?? []),
    [dependencyFailures],
  );

  const handleSyncRequiredCollections = () => {
    setFieldValue("collections", {
      ...values.collections,
      ...Object.fromEntries([...requiredCollectionIds].map((id) => [id, true])),
    });
  };

  return (
    <RemoteSyncSettingsSection
      title={t`Collections to sync`}
      description={t`Choose which collections to sync with git.`}
    >
      <Stack gap="lg">
        <TopLevelCollectionsList
          blockedCollectionIds={blockedCollectionIds}
          requiredCollectionIds={requiredCollectionIds}
        />
        {useTenants && (
          <>
            <Text fw={700} size="md" lh="1rem">
              {t`Shared collections`}
            </Text>
            <SharedTenantCollectionsList
              blockedCollectionIds={blockedCollectionIds}
              requiredCollectionIds={requiredCollectionIds}
            />
          </>
        )}
        {dependencyFailures && dependencyFailures.length > 0 && (
          <Stack>
            <Title
              order={4}
              c="error"
            >{t`Couldn’t sync selected collection`}</Title>
            <Text size="sm">{getBlockedMessage(dependencyFailures)}</Text>
            {getBlockedReason(dependencyFailures) !== "personal-content" && (
              <Group>
                <Button
                  variant="subtle"
                  px={0}
                  onClick={handleSyncRequiredCollections}
                >{t`Sync required collections`}</Button>
              </Group>
            )}
          </Stack>
        )}
      </Stack>
    </RemoteSyncSettingsSection>
  );
};

/**
 * Which situation the admin is actually in. Ordered by how much it constrains them: content they
 * can't sync at all outranks content they can, so the message never tells them to fix something
 * that wouldn't be enough on its own.
 */
type BlockedReason = "personal-content" | "library" | "linked-collections";

const getBlockedReason = (
  failures: RemoteSyncDependencyFailure[],
): BlockedReason => {
  if (getCollectionIdsBlockedByPersonalContent(failures).size > 0) {
    return "personal-content";
  }
  if (requiresLibrarySync(failures)) {
    return "library";
  }
  return "linked-collections";
};

const getBlockedMessage = (failures: RemoteSyncDependencyFailure[]): string => {
  switch (getBlockedReason(failures)) {
    case "personal-content":
      return t`Dashboards or questions in this collection rely on content saved in a personal collection, which can’t be synced. Move that content to a shared collection to continue.`;
    case "library":
      return t`Dashboards or questions in this collection rely on snippets, which sync with the Library. Sync the Library as well to continue.`;
    case "linked-collections":
      return t`Dashboards or questions in this collection rely on data saved elsewhere. To continue, sync those linked collections as well.`;
  }
};

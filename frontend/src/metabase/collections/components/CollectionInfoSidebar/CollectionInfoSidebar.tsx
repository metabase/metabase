import { useCallback, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { Sidesheet, SidesheetCard } from "metabase/common/components/Sidesheet";
import { SidesheetEditableDescription } from "metabase/common/components/Sidesheet/components/SidesheetEditableDescription";
import { EntityIdCard } from "metabase/components/EntityIdCard";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import { Stack, Title } from "metabase/ui";
import type { Collection } from "metabase-types/api";

export const CollectionInfoSidebar = ({
  onClose,
  collection,
  onUpdateCollection,
}: {
  onClose: () => void;
  collection: Collection;
  onUpdateCollection: (entity: Collection, values: Partial<Collection>) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  useMount(() => {
    // this component is not rendered until it is "open"
    // but we want to set isOpen after it mounts to get
    // pretty animations
    setIsOpen(true);
  });

  const handleChangeDescription = useCallback(
    (description: string) => {
      onUpdateCollection(collection, {
        description: description.trim() || null,
      });
    },
    [collection, onUpdateCollection],
  );
  const description = collection.description?.trim() || null;
  const canWrite = collection.can_write;

  return (
    <Sidesheet
      title={t`Info`}
      isOpen={isOpen}
      data-testid="collection-sidesheet"
      size="md"
      onClose={onClose}
    >
      <Stack spacing="lg">
        <SidesheetCard pb="md">
          <Stack spacing="md">
            <Stack spacing="xs">
              <Title lh={1} size="sm" color="text-light">
                {t`Description`}
              </Title>
              <SidesheetEditableDescription
                description={description}
                onChange={handleChangeDescription}
                canWrite={canWrite}
              />
            </Stack>
            <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelDisplay
              collection={collection}
            />
          </Stack>
        </SidesheetCard>
        {collection.entity_id && (
          <EntityIdCard entityId={collection.entity_id} />
        )}
      </Stack>
    </Sidesheet>
  );
};

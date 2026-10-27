import { useCallback, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import {
  SIDEBAR_WIDTH,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { EntityIdFooter } from "metabase/common/components/EntityIdFooter";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import { SidesheetEditableDescription } from "metabase/common/components/Sidesheet/components/SidesheetEditableDescription";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import { Box, Stack } from "metabase/ui";
import type { Collection, CollectionItemModel } from "metabase-types/api";

import { CollectionContentsSection } from "./CollectionContentsSection";

export const CollectionInfoSidebar = ({
  onClose,
  collection,
  onUpdateCollection,
  onFilterByType,
}: {
  onClose: () => void;
  collection: Collection;
  onUpdateCollection: (entity: Collection, values: Partial<Collection>) => void;
  onFilterByType?: (model: CollectionItemModel) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  useMount(() => {
    // This component is not rendered until it is "open"
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
      title={
        <Box component="span" fz="h3" lh="h3">
          {t`Info`}
        </Box>
      }
      isOpen={isOpen}
      data-testid="collection-sidesheet"
      size={SIDEBAR_WIDTH}
      onClose={onClose}
      footer={
        collection.entity_id ? (
          <EntityIdFooter
            items={[
              { label: t`This collection`, entityId: collection.entity_id },
            ]}
          />
        ) : undefined
      }
    >
      <Stack gap="xxl">
        <SidebarSection title={t`Description`} gap={0}>
          <Stack gap="sm">
            <SidesheetEditableDescription
              description={description}
              onChange={handleChangeDescription}
              canWrite={canWrite}
              maxLength={255}
            />
            <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelDisplay
              collection={collection}
            />
          </Stack>
        </SidebarSection>
        <CollectionContentsSection
          collection={collection}
          onFilterByType={onFilterByType}
        />
      </Stack>
    </Sidesheet>
  );
};

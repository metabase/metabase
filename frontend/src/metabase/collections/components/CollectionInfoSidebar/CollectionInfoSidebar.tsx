import { useCallback } from "react";
import { t } from "ttag";

import type { CollectionTypeFilterModel } from "metabase/collections/components/CollectionContent/constants";
import {
  SIDEBAR_WIDTH,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { EntityIdFooter } from "metabase/common/components/EntityIdFooter";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import { SidesheetEditableDescription } from "metabase/common/components/Sidesheet/components/SidesheetEditableDescription";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import { Stack } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import { CollectionContentsSection } from "./CollectionContentsSection";

const DESCRIPTION_MAX_LENGTH = 255;

export const CollectionInfoSidebar = ({
  onClose,
  collection,
  onUpdateCollection,
  onFilterByType,
}: {
  onClose: () => void;
  collection: Collection;
  onUpdateCollection: (entity: Collection, values: Partial<Collection>) => void;
  onFilterByType?: (model: CollectionTypeFilterModel) => void;
}) => {
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
      titleSize="h3"
      isOpen
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
              maxLength={DESCRIPTION_MAX_LENGTH}
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

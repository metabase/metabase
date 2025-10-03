import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { POST } from "metabase/lib/api";
import type { Collection } from "metabase-types/api";

interface CollectionRepresentationImportProps {
  collection: Collection;
}

export const CollectionRepresentationImport = ({
  collection,
}: CollectionRepresentationImportProps) => {
  const handleClick = async () => {
    try {
      await POST(`/api/ee/representation/collection/${collection.id}/import`)(
        {},
      );
    } catch (error) {
      console.error("Failed to import collection representations:", error);
    }
  };

  return (
    <ToolbarButton
      icon="upload"
      aria-label={t`Import representations to collection`}
      tooltipLabel={t`Import representations to collection`}
      tooltipPosition="bottom"
      onClick={handleClick}
    />
  );
};

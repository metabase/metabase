import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { POST } from "metabase/lib/api";
import type { Collection } from "metabase-types/api";

interface CollectionRepresentationExportProps {
  collection: Collection;
}

export const CollectionRepresentationExport = ({
  collection,
}: CollectionRepresentationExportProps) => {
  const handleClick = async () => {
    try {
      await POST(`/api/ee/representation/collection/${collection.id}/export`)(
        {},
      );
    } catch (error) {
      console.error("Failed to export collection representations:", error);
    }
  };

  return (
    <ToolbarButton
      icon="download"
      aria-label={t`Export collection representations`}
      tooltipLabel={t`Export collection representations`}
      tooltipPosition="bottom"
      onClick={handleClick}
    />
  );
};

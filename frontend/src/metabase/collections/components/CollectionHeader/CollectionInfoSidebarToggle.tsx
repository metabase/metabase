import { useState } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import type { Collection } from "metabase-types/api";

import { CollectionInfoSidebar } from "../CollectionInfoSidebar";

export const CollectionInfoSidebarToggle = ({
  collection,
  readOnly,
  onUpdateCollection,
}: {
  collection: Collection;
  readOnly?: boolean;
  onUpdateCollection: (entity: Collection, values: Partial<Collection>) => void;
}) => {
  const [showSidesheet, setShowSidesheet] = useState(false);
  return (
    <>
      <ToolbarButton
        icon="info"
        aria-label={t`More info`}
        tooltipLabel={t`More info`}
        tooltipPosition="bottom"
        onClick={() => setShowSidesheet((open) => !open)}
      />
      {showSidesheet && (
        <CollectionInfoSidebar
          onClose={() => setShowSidesheet(false)}
          collection={collection}
          readOnly={readOnly}
          onUpdateCollection={onUpdateCollection}
        />
      )}
    </>
  );
};

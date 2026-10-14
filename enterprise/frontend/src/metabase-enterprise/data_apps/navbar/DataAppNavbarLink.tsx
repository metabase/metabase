import { useId, useState } from "react";
import { t } from "ttag";

import { TreeNode } from "metabase/common/components/tree/TreeNode";
import { PaddedSidebarLink } from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import { SidebarLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import { ExpandToggleButton } from "metabase/nav/containers/MainNavbar/SidebarItems/SidebarItems.styled";
import { Box } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DataApp } from "metabase-types/api";

interface Props {
  dataApp: DataApp;
  onItemSelect: () => void;
}

export function DataAppNavbarLink({ dataApp, onItemSelect }: Props) {
  const contentsId = useId();
  const [isContentsExpanded, setIsContentsExpanded] = useState(false);

  const { display_name: displayName, resource_collection_id: collectionId } =
    dataApp;

  const toggleButton = (
    <ExpandToggleButton
      aria-label={
        isContentsExpanded
          ? t`Collapse ${displayName}`
          : t`Expand ${displayName}`
      }
      aria-expanded={isContentsExpanded}
      aria-controls={contentsId}
      onClick={() => setIsContentsExpanded(!isContentsExpanded)}
    >
      <TreeNode.ExpandToggleIcon
        name="chevronright"
        isExpanded={isContentsExpanded}
        size={12}
      />
    </ExpandToggleButton>
  );

  return (
    <>
      <SidebarLink
        icon="app"
        onClick={onItemSelect}
        rel="noopener noreferrer"
        target="_blank"
        url={Urls.dataApp(dataApp.name)}
        left={toggleButton}
      >
        {displayName}
      </SidebarLink>

      {isContentsExpanded && (
        <Box id={contentsId} pl="1.5rem">
          <PaddedSidebarLink
            icon="folder"
            url={`/collection/${collectionId}`}
            onClick={onItemSelect}
          >
            {t`Contents`}
          </PaddedSidebarLink>
        </Box>
      )}
    </>
  );
}

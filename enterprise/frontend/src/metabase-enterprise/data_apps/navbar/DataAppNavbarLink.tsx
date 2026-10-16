import { useId, useState } from "react";
import { t } from "ttag";

import { TreeNode } from "metabase/common/components/tree/TreeNode";
import { SidebarLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
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
    <TreeNode.ExpandToggleButton
      c="core-brand"
      py="xxs"
      pl="xxxs"
      pr={0}
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
    </TreeNode.ExpandToggleButton>
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
          <SidebarLink
            icon="folder"
            url={`/collection/${collectionId}`}
            onClick={onItemSelect}
          >
            {t`Contents`}
          </SidebarLink>
        </Box>
      )}
    </>
  );
}

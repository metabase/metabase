import { useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import CollapseSection from "metabase/common/components/CollapseSection";
import { Tree } from "metabase/common/components/tree";
import { useUserSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import type { CollectionTreeItem } from "metabase/entities/collections";

import { SidebarHeading, SidebarSection } from "../MainNavbar.styled";
import { SidebarCollectionLink } from "../SidebarItems";

type LibraryCollectionSectionProps = {
  libraryCollections: CollectionTreeItem[];
  selectedId?: string | number;
  onItemSelect: () => void;
};

export function LibraryCollectionSection({
  libraryCollections,
  selectedId,
  onItemSelect,
}: LibraryCollectionSectionProps) {
  const [expandLibrary = true, setExpandLibrary] = useUserSetting(
    "expand-library-in-nav",
  );

  const libraryChildren = useMemo(() => {
    if (libraryCollections.length === 0) {
      return [];
    }
    const rootLibrary = libraryCollections[0];
    return rootLibrary.children || [];
  }, [libraryCollections]);

  if (libraryChildren.length === 0) {
    return null;
  }

  const headerId = "headingForLibrarySectionOfSidebar";

  return (
    <SidebarSection>
      <ErrorBoundary>
        <CollapseSection
          aria-labelledby={headerId}
          header={<SidebarHeading id={headerId}>{t`Library`}</SidebarHeading>}
          initialState={expandLibrary ? "expanded" : "collapsed"}
          iconPosition="right"
          iconSize={8}
          headerClass={CS.mb1}
          onToggle={setExpandLibrary}
        >
          <Tree
            data={libraryChildren}
            selectedId={selectedId}
            onSelect={onItemSelect}
            TreeNode={SidebarCollectionLink}
            role="tree"
            aria-label="library-collection-tree"
          />
        </CollapseSection>
      </ErrorBoundary>
    </SidebarSection>
  );
}

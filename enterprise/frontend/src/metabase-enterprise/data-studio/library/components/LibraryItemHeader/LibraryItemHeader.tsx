import type { ReactNode } from "react";

import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import type { CollectionEssentials } from "metabase-types/api";

import type { LibraryItemRef } from "../../types";
import { getLibraryItemSection } from "../../utils";
import { LibraryArchivedBanner } from "../LibraryArchivedBanner";
import { LibrarySectionBreadcrumbs } from "../LibrarySectionBreadcrumbs";

type LibraryItemHeaderProps = LibraryItemRef & {
  folders: CollectionEssentials[];
  tabs: ReactNode;
  actions: ReactNode;
};

export function LibraryItemHeader({
  folders,
  tabs,
  actions,
  ...itemRef
}: LibraryItemHeaderProps) {
  const { model, item } = itemRef;

  return (
    <>
      {item.archived && <LibraryArchivedBanner {...itemRef} />}
      <PaneHeader
        data-testid={`${model}-pane-header`}
        title={<PanelHeaderTitle>{item.name}</PanelHeaderTitle>}
        icon={getLibraryItemSection(model).icon}
        tabs={tabs}
        actions={actions}
        breadcrumbs={
          <LibrarySectionBreadcrumbs
            model={model}
            folders={folders}
            itemName={item.name}
          />
        }
      />
    </>
  );
}

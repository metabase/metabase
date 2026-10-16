import { Link } from "metabase/common/components/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import * as Urls from "metabase/urls";
import type { CollectionEssentials } from "metabase-types/api";

import type { LibraryItemModel } from "../../types";
import { getLibraryItemSection } from "../../utils";

type LibrarySectionBreadcrumbsProps = {
  model: LibraryItemModel;
  /** The folders between the section and the item, outermost first */
  folders: CollectionEssentials[];
  itemName: string;
};

export function LibrarySectionBreadcrumbs({
  model,
  folders,
  itemName,
}: LibrarySectionBreadcrumbsProps) {
  const section = getLibraryItemSection(model);

  return (
    <DataStudioBreadcrumbs>
      <Link to={section.getUrl()}>{section.getName()}</Link>
      {folders.map((folder, index) => (
        <Link
          key={folder.id}
          to={
            // The section list leaves out trashed folders
            folder.archived
              ? Urls.collection(folder)
              : section.getUrl({
                  expandedIds: folders
                    .slice(0, index + 1)
                    .map((ancestor) => ancestor.id),
                })
          }
        >
          {folder.name}
        </Link>
      ))}
      <span>{itemName}</span>
    </DataStudioBreadcrumbs>
  );
}

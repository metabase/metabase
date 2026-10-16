import { t } from "ttag";

import {
  useDeleteDashboardMutation,
  useDeleteDocumentMutation,
} from "metabase/api";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import { type ArchivableItem, useSetArchive } from "metabase/archive/hooks";
import { Link } from "metabase/common/components/Link";
import { useSetCollection } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { useNavigate } from "metabase/router";
import { Anchor } from "metabase/ui";
import * as Urls from "metabase/urls";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { Collection } from "metabase-types/api";

import type { LibraryItemModel, LibraryItemRef } from "../../types";
import { getLibraryItemSection } from "../../utils";

type LibraryArchivableItem = Extract<
  ArchivableItem,
  { model: LibraryItemModel }
>;

function getArchivableItem(itemRef: LibraryItemRef): LibraryArchivableItem {
  return itemRef.model === "dashboard"
    ? { model: "dashboard", id: itemRef.item.id }
    : { model: "document", id: itemRef.item.id };
}

type LibraryArchivedBannerProps = LibraryItemRef;

export function LibraryArchivedBanner(itemRef: LibraryArchivedBannerProps) {
  const { model, item } = itemRef;
  const section = getLibraryItemSection(model);
  const archivable = getArchivableItem(itemRef);
  const isReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const archive = useSetArchive();
  const setCollection = useSetCollection();
  const [deleteDashboard] = useDeleteDashboardMutation();
  const [deleteDocument] = useDeleteDocumentMutation();
  // An item trashed along with its folder is restored by restoring the folder
  const trashedFolder = item.archived_directly ? null : item.collection;

  const handleDeletePermanently = async () => {
    if (itemRef.model === "dashboard") {
      await deleteDashboard(itemRef.item.id).unwrap();
    } else {
      await deleteDocument({ id: itemRef.item.id }).unwrap();
    }
    navigate(section.getUrl());
    dispatch(addUndo({ message: t`This item has been permanently deleted.` }));
  };

  return (
    <ArchivedEntityBanner
      name={item.name}
      entityType={section.entityName}
      message={
        trashedFolder != null
          ? section.getTrashedFolderMessage(
              <TrashedFolderLink key="folder" folder={trashedFolder} />,
            )
          : undefined
      }
      canMove={item.can_write && !isReadOnly}
      canRestore={item.can_restore && !isReadOnly}
      canDelete={item.can_delete && !isReadOnly}
      onUnarchive={() => archive(archivable, false)}
      onMove={({ id }) => setCollection(archivable, { id })}
      onDeletePermanently={handleDeletePermanently}
    />
  );
}

type TrashedFolderLinkProps = {
  folder: Collection;
};

function TrashedFolderLink({ folder }: TrashedFolderLinkProps) {
  return (
    <Anchor
      component={Link}
      to={Urls.collection(folder)}
      c="text-primary-inverse"
      td="underline"
    >
      {folder.name}
    </Anchor>
  );
}

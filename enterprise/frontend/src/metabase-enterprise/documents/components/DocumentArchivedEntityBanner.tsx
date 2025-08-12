import { t } from "ttag";

import { deletePermanently } from "metabase/archive/actions";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner/ArchivedEntityBanner";
import Bookmarks from "metabase/entities/bookmarks";
import { useDispatch } from "metabase/lib/redux";
import Documents from "metabase-enterprise/entities/document";

import { useDocumentsSelector } from "../redux-utils";
import { getCurrentDocument } from "../selectors";

export const DocumentArchivedEntityBanner = () => {
  const dispatch = useDispatch();
  const document = useDocumentsSelector(getCurrentDocument);

  if (!document) {
    return null;
  }

  return (
    <ArchivedEntityBanner
      name={document.name}
      entityType={t`document`}
      canMove={document.can_write}
      canRestore={document.can_restore}
      canDelete={document.can_delete}
      onUnarchive={async () => {
        await dispatch(Documents.actions.setArchived(document, false));
        await dispatch(Bookmarks.actions.invalidateLists());
      }}
      onMove={({ id }) =>
        dispatch(Documents.actions.setCollection(document, { id }))
      }
      onDeletePermanently={() => {
        const deleteAction = Documents.actions.delete({ id: document.id });
        dispatch(deletePermanently(deleteAction));
      }}
    />
  );
};

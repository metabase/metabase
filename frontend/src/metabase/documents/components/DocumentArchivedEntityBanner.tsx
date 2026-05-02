import { t } from "ttag";

import { deletePermanently } from "metabase/archive/actions";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner/ArchivedEntityBanner";
import { useSetArchive } from "metabase/common/hooks";
import { Bookmarks } from "metabase/entities/bookmarks";
import { Documents } from "metabase/entities/documents";
import { useDispatch, useSelector } from "metabase/redux";

import { getCurrentDocument } from "../selectors";

export const DocumentArchivedEntityBanner = () => {
  const dispatch = useDispatch();
  const archive = useSetArchive();
  const document = useSelector(getCurrentDocument);

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
        await archive({ id: document.id, model: "document" }, false);
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

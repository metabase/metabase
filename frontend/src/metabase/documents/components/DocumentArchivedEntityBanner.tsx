import { push } from "react-router-redux";
import { t } from "ttag";

import { useDeleteDocumentMutation } from "metabase/api";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner/ArchivedEntityBanner";
import { useSetArchive, useSetCollection } from "metabase/common/hooks";
import { Bookmarks } from "metabase/entities/bookmarks";
import { useDispatch, useSelector } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";

import { getCurrentDocument } from "../selectors";

export const DocumentArchivedEntityBanner = () => {
  const dispatch = useDispatch();
  const archive = useSetArchive();
  const setCollection = useSetCollection();
  const document = useSelector(getCurrentDocument);
  const [deleteDocument] = useDeleteDocumentMutation();

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
        setCollection({ model: "document", id: document.id }, { id })
      }
      onDeletePermanently={async () => {
        await deleteDocument({ id: document.id }).unwrap();
        dispatch(push("/trash"));
        dispatch(
          addUndo({ message: t`This item has been permanently deleted.` }),
        );
      }}
    />
  );
};

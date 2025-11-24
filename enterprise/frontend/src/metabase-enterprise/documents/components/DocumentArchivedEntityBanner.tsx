import { t } from "ttag";

import { Api } from "metabase/api";
import { listTag } from "metabase/api/tags";
import { deletePermanently } from "metabase/archive/actions";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner/ArchivedEntityBanner";
import { useDispatch, useSelector } from "metabase/lib/redux";
import Documents from "metabase-enterprise/entities/documents";

import { getCurrentDocument } from "../selectors";

export const DocumentArchivedEntityBanner = () => {
  const dispatch = useDispatch();
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
        await dispatch(Documents.actions.setArchived(document, false));
        dispatch(Api.util.invalidateTags([listTag("bookmark")]));
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

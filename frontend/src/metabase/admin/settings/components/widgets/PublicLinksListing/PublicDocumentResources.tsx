import { t } from "ttag";

import { PublicLinksListing } from "metabase/admin/settings/components/widgets/PublicLinksListing/index";
import {
  useDeleteDocumentPublicLinkMutation,
  useListPublicDocumentsQuery,
} from "metabase/api";
import * as Urls from "metabase/lib/urls";
import type { Document } from "metabase-types/api";

export const PublicLinksDocumentListing = () => {
  const query = useListPublicDocumentsQuery();
  const [revoke] = useDeleteDocumentPublicLinkMutation();

  return (
    <PublicLinksListing<Pick<Document, "id" | "name" | "public_uuid">>
      revoke={revoke}
      getUrl={(document) => Urls.document(document)}
      getPublicUrl={({ public_uuid }) => {
        if (public_uuid) {
          return Urls.publicDocument(public_uuid);
        }
        return null;
      }}
      noLinksMessage={t`No documents have been publicly shared yet.`}
      {...query}
    />
  );
};

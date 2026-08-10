import { t } from "ttag";

import { PublicLinksListing } from "metabase/admin/settings/components/widgets/PublicLinksListing/index";
import {
  useDeleteDocumentPublicLinkMutation,
  useListPublicDocumentsQuery,
} from "metabase/api";
import * as Urls from "metabase/urls";
import type { GetPublicDocument } from "metabase-types/api";

export const PublicLinksDocumentListing = () => {
  const query = useListPublicDocumentsQuery();
  const [revoke] = useDeleteDocumentPublicLinkMutation();

  return (
    <PublicLinksListing<GetPublicDocument>
      revoke={revoke}
      getUrl={(document) => Urls.document(document)}
      getPublicUrl={({ public_uuid }) => {
        if (public_uuid) {
          return Urls.publicDocument(public_uuid);
        }
        return null;
      }}
      getWarning={(item) =>
        item.contains_custom_viz
          ? t`Contains custom visualizations, which appear as tables in the public link.`
          : undefined
      }
      noLinksMessage={t`No documents have been publicly shared yet.`}
      {...query}
    />
  );
};

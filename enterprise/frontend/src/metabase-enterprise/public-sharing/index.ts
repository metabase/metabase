import { PLUGIN_PUBLIC_SHARING } from "metabase/plugins";

import { PublicLinksDocumentListing } from "../admin/settings/components/widgets/PublicLinksListing/PublicDocumentResources";
import { PublicDocument } from "../public/containers/PublicDocument";

PLUGIN_PUBLIC_SHARING.PublicDocumentRoute = PublicDocument;
PLUGIN_PUBLIC_SHARING.PublicLinksDocumentListing = PublicLinksDocumentListing;

import { PLUGIN_PUBLIC_SHARING } from "metabase/plugins";

import { PublicLinksDocumentListing } from "../admin/settings/components/widgets/PublicLinksListing/PublicDocumentResources";
import { PublicDocument } from "../public/containers/PublicDocument";

/**
 * Initialize sharing plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  PLUGIN_PUBLIC_SHARING.PublicDocumentRoute = PublicDocument;
  PLUGIN_PUBLIC_SHARING.PublicLinksDocumentListing = PublicLinksDocumentListing;
}

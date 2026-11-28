import type { JSX } from "react";
import { t } from "ttag";

import { useTranslateContent } from "metabase/content-translation/hooks";
import { useGitIntegrationEnabled } from "metabase/nav/prototype/use-git-integration-enabled";
import { useNavVariant } from "metabase/nav/prototype/use-nav-variant";
import { useSyncedCollectionIds } from "metabase/nav/prototype/use-synced-collection-ids";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { useLocation } from "metabase/router";
import * as Urls from "metabase/urls";
import type {
  Collection,
  CollectionEssentials,
  CollectionId,
  Dashboard,
} from "metabase-types/api";

import {
  type BreadcrumbCrumb,
  CollectionBreadcrumbsView,
} from "./CollectionBreadcrumbsView";
import { collectionToCrumbs } from "./utils";

export interface CollectionBreadcrumbsProps {
  collection?: Collection;
  dashboard?: Dashboard;
  onClick?: (collection: CollectionEssentials) => void;
  baseCollectionId: CollectionId | null;
  truncateLongestFirst?: boolean;
}

const isLibraryType = (collection: Pick<Collection, "type">) =>
  collection.type?.startsWith("library") ?? false;

/**
 * PROTOTYPE: the "Modern nav - C" nav tab a collection lives under, as a crumb
 * to lead its collection page's trail: Official (synced from git), External
 * collections (tenants), or the rest, personal collections included, linking
 * to the root — "Shared" next to Official with git on, "Collections" with it
 * off. None for the Library (its trail starts at "Data") or the root itself.
 */
function getPseudoCollectionCrumb(
  collection: Collection,
  isOfficial: boolean,
  isGitIntegrationEnabled: boolean,
): BreadcrumbCrumb | null {
  const ancestors = collection.effective_ancestors ?? [];
  if (
    collection.id === "root" ||
    isLibraryType(collection) ||
    ancestors.some(isLibraryType)
  ) {
    return null;
  }
  if (collection.namespace === PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE) {
    return {
      kind: "static",
      key: "pseudo-external",
      icon: "globe",
      label: t`External collections`,
    };
  }
  if (isOfficial) {
    return {
      kind: "static",
      key: "pseudo-official",
      icon: "folder_bookmark",
      label: t`Official`,
    };
  }
  return {
    kind: "static",
    key: "pseudo-collections",
    icon: "folder",
    label: isGitIntegrationEnabled ? t`Shared` : t`Collections`,
    // With no collection, this is the root's URL.
    to: Urls.collection(),
  };
}

export const CollectionBreadcrumbs = ({
  collection,
  dashboard,
  onClick,
  baseCollectionId = null,
  truncateLongestFirst,
}: CollectionBreadcrumbsProps): JSX.Element | null => {
  const tc = useTranslateContent();
  const { pathname } = useLocation();
  const { variant } = useNavVariant();
  const { isEnabled: isGitIntegrationEnabled } = useGitIntegrationEnabled();
  // Synced collections and everything inside them; the nav's cached tree.
  const syncedCollectionIds = useSyncedCollectionIds({
    skip: !isGitIntegrationEnabled || variant !== "modern-nav-c",
  });

  if (!collection) {
    return null;
  }

  const crumbs = collectionToCrumbs({ collection, baseCollectionId, onClick });
  // PROTOTYPE: on "Modern nav - C"'s collection pages, the trail leaves out
  // the collection itself (its title is right below) and starts at the nav
  // tab it lives under.
  const isVariantCCollectionPage =
    variant === "modern-nav-c" &&
    !dashboard &&
    pathname.startsWith("/collection/");
  const pseudoCrumb = isVariantCCollectionPage
    ? getPseudoCollectionCrumb(
        collection,
        isGitIntegrationEnabled && syncedCollectionIds.has(collection.id),
        isGitIntegrationEnabled,
      )
    : null;
  const path = isVariantCCollectionPage
    ? [...(pseudoCrumb ? [pseudoCrumb] : []), ...crumbs.slice(0, -1)]
    : crumbs;

  return (
    <CollectionBreadcrumbsView
      path={path}
      terminal={
        dashboard
          ? {
              kind: "static",
              key: `dashboard-${dashboard.id}`,
              icon: "dashboard",
              label: tc(dashboard.name),
              to: Urls.dashboard(dashboard),
            }
          : undefined
      }
      truncateLongestFirst={truncateLongestFirst}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionBreadcrumbs;

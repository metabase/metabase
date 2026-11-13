import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
} from "metabase/admin/permissions/components/PermissionsEditor";
import { PermissionsPageLayout } from "metabase/admin/permissions/components/PermissionsPageLayout";
import { skipToken } from "metabase/api";
import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
import {
  CollectionPermissionsHelp,
  type EntityView,
  type PermissionEditorEntity,
} from "metabase/permissions";
import { useNavigate, useParams } from "metabase/router";

import {
  type CollectionNamespace,
  type PreviewCollection,
  type PreviewCollectionsResponse,
  type PreviewPrincipal,
  useGetCollectionsPreviewQuery,
} from "../api";

import { DoesNotApply } from "./DoesNotApply";
import { PreviewSidebar } from "./PreviewSidebar";
import { PrincipalHeader, getWhoName } from "./PrincipalHeader";
import { WhySidesheet, type WhyTarget, getWhySection } from "./WhySidesheet";
import {
  type PreviewRouteParams,
  type PreviewTab,
  getPreviewUrl,
  parsePrincipal,
  parsePrincipalType,
} from "./urls";
import { useRememberPrincipal } from "./use-remember-principal";

const COLLECTION_VIEWS: EntityView[] = ["collection"];

type CollectionTab = Extract<
  PreviewTab,
  "collections" | "tenant-collections" | "tenant-specific-collections"
>;

type CollectionPreviewPageProps = {
  tab: CollectionTab;
  namespace: CollectionNamespace;
};

/** A collections tab's Preview: which collections a user, a group or a tenant can open, and how. */
export function CollectionPreviewPage({
  tab,
  namespace,
}: CollectionPreviewPageProps) {
  const params = useParams<PreviewRouteParams>();
  const navigate = useNavigate();
  const principalType = parsePrincipalType(params);
  const principal = parsePrincipal(params);
  const [whyTarget, setWhyTarget] = useState<WhyTarget | null>(null);
  useRememberPrincipal(tab, principal, params.principalType == null);

  const { data, isFetching, error } = useGetCollectionsPreviewQuery(
    principal ? { principal, namespace } : skipToken,
  );

  return (
    <PermissionsPageLayout
      tab={tab}
      helpContent={<CollectionPermissionsHelp />}
    >
      <PreviewSidebar
        title={getTabTitle(tab)}
        principalType={principalType}
        principal={principal}
        entityViews={COLLECTION_VIEWS}
        onEntityChange={() => navigate(`${getPermissionsBasePath()}/${tab}`)}
        onPrincipalTypeChange={(type) => navigate(getPreviewUrl(tab, { type }))}
        onPrincipalChange={(principal) =>
          navigate(getPreviewUrl(tab, principal))
        }
      />
      {!principal && (
        <PermissionsEditorEmptyState
          icon="eye"
          message={t`Select a user, a group or a tenant to preview their access`}
        />
      )}
      {principal && data && !data.applies && (
        <DoesNotApply principal={data.principal} reason={data.reason} />
      )}
      {principal && (!data || data.applies) && (
        <PermissionsEditor
          isLoading={isFetching && !data}
          error={error ? t`Couldn't load the preview` : undefined}
          title={getTabTitle(tab)}
          filterPlaceholder={t`Search for a collection`}
          columns={[{ name: t`Collection` }, { name: t`Access` }]}
          entities={data ? getEntities(data, setWhyTarget) : []}
          onChange={_.noop}
          preHeaderContent={
            data
              ? () => (
                  <PrincipalHeader
                    principal={data.principal}
                    hint={getHint(namespace, data.principal.type)}
                  />
                )
              : undefined
          }
        />
      )}
      <WhySidesheet target={whyTarget} onClose={() => setWhyTarget(null)} />
    </PermissionsPageLayout>
  );
}

function getTabTitle(tab: CollectionTab) {
  switch (tab) {
    case "collections":
      return t`Collections`;
    case "tenant-collections":
      return t`Shared collections`;
    case "tenant-specific-collections":
      return t`Tenant collections`;
  }
}

function getEntities(
  data: PreviewCollectionsResponse,
  onWhy: (target: WhyTarget) => void,
): PermissionEditorEntity[] {
  return data.collections.map((collection, index) => ({
    id: collection.id ?? `row-${index}`,
    // The grid has no tree, so a collection's depth shows as indentation.
    name: `${" ".repeat(collection.depth * 4)}${collection.name}`,
    permissions: [
      getWhySection(
        {
          title: collection.name,
          who: getWhoName(data.principal),
          subject: { label: t`Collection`, value: collection.name },
          column: "collection",
          // Access that no group grants (a personal or tenant collection) says where it comes from instead.
          cell: {
            ...collection.access,
            note: collection.access.note ?? getSourceNote(collection.source),
          },
          security: null,
        },
        onWhy,
      ),
    ],
  }));
}

function getSourceNote(source: PreviewCollection["source"]) {
  switch (source) {
    case "personal":
      return t`Their own personal collection`;
    case "tenant":
      return t`From being a user of this tenant`;
    case "other-tenant":
      return t`Another tenant's collection`;
    case "group":
      return null;
  }
}

function getHint(
  namespace: CollectionNamespace,
  principalType: PreviewPrincipal["type"],
) {
  switch (namespace) {
    case "default":
      return t`Which collections they can open, and through which group. Click a value for why.`;
    case "shared":
      return principalType === "tenant"
        ? t`The same for every tenant: shared collections are granted to groups, not tenants. Preview a tenant's user to include their own tenant groups.`
        : t`Shared collections they can open. Tenant groups get View at most.`;
    case "tenant":
      return t`Tenant collections they can open. A tenant's own users get their tenant's collection from membership, never from a group.`;
  }
}

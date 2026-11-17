import { useEffect, useState } from "react";
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
  useNoTenantOnSharedTab(tab, namespace, principalType);

  const { data, isFetching, error } = useGetCollectionsPreviewQuery(
    principal ? { principal, namespace } : skipToken,
  );

  return (
    <PermissionsPageLayout
      tab={tab}
      helpContent={<CollectionPermissionsHelp />}
    >
      <PreviewSidebar
        // core's collections sidebar title (`getCollectionsSidebar`)
        title={t`Collections`}
        principalType={principalType}
        principal={principal}
        entityViews={COLLECTION_VIEWS}
        onEntityChange={() => navigate(`${getPermissionsBasePath()}/${tab}`)}
        tenantDisabledReason={
          namespace === "shared"
            ? t`Shared collections are granted to groups, not tenants. Pick a tenant user to see what they get.`
            : undefined
        }
        onPrincipalTypeChange={(type) => navigate(getPreviewUrl(tab, { type }))}
        onPrincipalChange={(principal) =>
          navigate(getPreviewUrl(tab, principal))
        }
      />
      {!principal && (
        <PermissionsEditorEmptyState
          icon="eye"
          message={t`Select a user, group, or tenant to preview their access`}
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
          entities={data ? getEntities(data, setWhyTarget, whyTarget) : []}
          onChange={_.noop}
          preHeaderContent={
            data
              ? () => (
                  <PrincipalHeader
                    principal={data.principal}
                    hint={getHint(namespace)}
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

/** Tenant is disabled on Shared collections: a tenant brought along from another tab, or a link, becomes User. */
function useNoTenantOnSharedTab(
  tab: CollectionTab,
  namespace: CollectionNamespace,
  principalType: PreviewPrincipal["type"],
) {
  const navigate = useNavigate();
  const isTenantOnSharedTab =
    namespace === "shared" && principalType === "tenant";

  useEffect(() => {
    if (isTenantOnSharedTab) {
      navigate(getPreviewUrl(tab, { type: "user" }), { replace: true });
    }
  }, [isTenantOnSharedTab, tab, navigate]);
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
  explained: WhyTarget | null,
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
        explained,
      ),
    ],
  }));
}

function getSourceNote(source: PreviewCollection["source"]) {
  switch (source) {
    case "personal":
      return t`Their own personal collection`;
    case "tenant":
      return t`Because they're a user of this tenant`;
    case "other-tenant":
      return t`Another tenant's collection`;
    case "group":
      return null;
  }
}

function getHint(namespace: CollectionNamespace) {
  switch (namespace) {
    case "default":
      return t`The collections they can open, and the group each one's access comes from. Click a value to see why.`;
    case "shared":
      return t`Shared collections they can open. Tenant groups can get View access at most.`;
    case "tenant":
      return t`Tenant collections they can open. Tenant users get access to their own tenant's collection because they belong to the tenant, not through a group.`;
  }
}

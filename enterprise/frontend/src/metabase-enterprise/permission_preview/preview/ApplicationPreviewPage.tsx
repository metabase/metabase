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
  ApplicationPermissionsHelp,
  type EntityView,
  type PermissionEditorEntity,
} from "metabase/permissions";
import { useNavigate, useParams } from "metabase/router";

import {
  type ApplicationPermissionKey,
  type PreviewApplicationResponse,
  useGetApplicationPreviewQuery,
} from "../api";

import { DoesNotApply } from "./DoesNotApply";
import { PreviewSidebar } from "./PreviewSidebar";
import { PrincipalHeader, getWhoName } from "./PrincipalHeader";
import { WhySidesheet, type WhyTarget, getWhySection } from "./WhySidesheet";
import {
  type PreviewRouteParams,
  getPreviewUrl,
  parsePrincipal,
  parsePrincipalType,
} from "./urls";
import { useRememberPrincipal } from "./use-remember-principal";

const APPLICATION_VIEWS: EntityView[] = ["group"];

/** Application › Preview: which admin features a user, a group or a tenant can use. */
export function ApplicationPreviewPage() {
  const params = useParams<PreviewRouteParams>();
  const navigate = useNavigate();
  const principalType = parsePrincipalType(params);
  const principal = parsePrincipal(params);
  const [whyTarget, setWhyTarget] = useState<WhyTarget | null>(null);
  useRememberPrincipal("application", principal, params.principalType == null);

  const { data, isFetching, error } = useGetApplicationPreviewQuery(
    principal ?? skipToken,
  );

  return (
    <PermissionsPageLayout
      tab="application"
      helpContent={<ApplicationPermissionsHelp />}
    >
      <PreviewSidebar
        principalType={principalType}
        principal={principal}
        entityViews={APPLICATION_VIEWS}
        onEntityChange={() =>
          navigate(`${getPermissionsBasePath()}/application`)
        }
        onPrincipalTypeChange={(type) =>
          navigate(getPreviewUrl("application", { type }))
        }
        onPrincipalChange={(principal) =>
          navigate(getPreviewUrl("application", principal))
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
          title={t`Application`}
          filterPlaceholder={t`Search for a permission`}
          columns={[{ name: t`Permission` }, { name: t`Access` }]}
          entities={data ? getEntities(data, setWhyTarget) : []}
          onChange={_.noop}
          preHeaderContent={
            data
              ? () => (
                  <PrincipalHeader
                    principal={data.principal}
                    hint={t`Admin features they can use. Click a value for why.`}
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

function getEntities(
  data: PreviewApplicationResponse,
  onWhy: (target: WhyTarget) => void,
): PermissionEditorEntity[] {
  return data.permissions.map(({ key, access }) => {
    const name = getPermissionName(key);
    return {
      id: key,
      name,
      permissions: [
        getWhySection(
          {
            title: name,
            who: getWhoName(data.principal),
            subject: { label: t`Permission`, value: name },
            column: "application",
            cell: access,
            security: null,
          },
          onWhy,
        ),
      ],
    };
  });
}

function getPermissionName(key: ApplicationPermissionKey) {
  switch (key) {
    case "setting":
      return t`Settings access`;
    case "monitoring":
      return t`Monitoring access`;
    case "subscription":
      return t`Subscriptions and alerts`;
  }
}

import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { PermissionsEditor } from "metabase/admin/permissions/components/PermissionsEditor";
import { skipToken } from "metabase/api";
import type { PermissionEditorEntity } from "metabase/permissions";
import type { TableUsersPreviewProps } from "metabase/plugins";
import { useNavigate } from "metabase/router";

import {
  type PreviewTableUsersResponse,
  useGetTableUsersPreviewQuery,
} from "../api";

import {
  PreviewEditsBanner,
  PreviewEditsSheet,
  usePreviewEdits,
} from "./PreviewEditsBanner";
import { getWhoName } from "./PrincipalHeader";
import { WhySidesheet, type WhyTarget, getWhySection } from "./WhySidesheet";
import { type PreviewColumn, getPreviewColumnName } from "./preview-options";

const TABLE_COLUMNS = [
  "view_data",
  "create_queries",
  "download_results",
  "manage_table_metadata",
] as const satisfies readonly PreviewColumn[];

/** Databases › a table, Preview: every user's effective access to that table. */
export function TableUsersPreview({
  tableId,
  preHeaderContent: PreHeaderContent,
}: TableUsersPreviewProps) {
  const navigate = useNavigate();
  const previewEdits = usePreviewEdits();
  const { unsavedEditsId } = previewEdits;
  const {
    currentData: data,
    isFetching,
    error,
  } = useGetTableUsersPreviewQuery(
    previewEdits.isKeeping ? skipToken : { tableId, unsavedEditsId },
  );
  const { currentData: savedData } = useGetTableUsersPreviewQuery(
    unsavedEditsId != null ? { tableId } : skipToken,
  );
  const [whyTarget, setWhyTarget] = useState<WhyTarget | null>(null);

  return (
    <>
      <PermissionsEditor
        isLoading={(isFetching && !data) || previewEdits.isKeeping}
        error={error ? t`Couldn't load the preview` : undefined}
        title={data ? getTableName(data) : ""}
        description={t`What each user gets from all their groups combined. Click a value to see why.`}
        filterPlaceholder={t`Search for a user`}
        columns={[
          { name: t`User` },
          ...TABLE_COLUMNS.map((column) => ({
            name: getPreviewColumnName(column),
          })),
        ]}
        entities={
          data
            ? getEntities(
                data,
                unsavedEditsId != null ? savedData : undefined,
                setWhyTarget,
                whyTarget,
              )
            : []
        }
        onChange={_.noop}
        preHeaderContent={() => (
          <>
            {previewEdits.hasEdits && (
              <PreviewEditsBanner
                previewEdits={previewEdits}
                principal={null}
              />
            )}
            {PreHeaderContent && <PreHeaderContent />}
          </>
        )}
      />
      <WhySidesheet target={whyTarget} onClose={() => setWhyTarget(null)} />
      <PreviewEditsSheet
        previewEdits={previewEdits}
        principal={null}
        onNavigate={navigate}
      />
    </>
  );
}

function getTableName({ table }: PreviewTableUsersResponse) {
  return table.display_name ?? table.name;
}

function getEntities(
  data: PreviewTableUsersResponse,
  /** The saved access, when `data` includes unsaved edits: values that differ get an "Unsaved" marker. */
  savedData: PreviewTableUsersResponse | undefined,
  onWhy: (target: WhyTarget) => void,
  explained: WhyTarget | null,
): PermissionEditorEntity[] {
  const tableName = getTableName(data);
  return data.users.map(({ principal, access }) => {
    const savedAccess = savedData?.users.find(
      (user) => user.principal.id === principal.id,
    )?.access;
    return {
      id: principal.id,
      name: principal.name,
      hint: principal.detail,
      permissions: TABLE_COLUMNS.map((column) => {
        const section = getWhySection(
          {
            title: `${tableName} · ${getPreviewColumnName(column)}`,
            who: getWhoName(principal),
            subject: {
              label: t`Table`,
              value: `${data.table.database_name} / ${tableName}`,
            },
            column,
            cell: access[column],
            security: access.security,
          },
          onWhy,
          explained,
        );
        const isChanged =
          savedAccess != null &&
          savedAccess[column].value !== access[column].value;
        return isChanged ? { ...section, valueMarker: t`Unsaved` } : section;
      }),
    };
  });
}

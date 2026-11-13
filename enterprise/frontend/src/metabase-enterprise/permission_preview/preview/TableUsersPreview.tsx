import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { PermissionsEditor } from "metabase/admin/permissions/components/PermissionsEditor";
import type { PermissionEditorEntity } from "metabase/permissions";
import type { TableUsersPreviewProps } from "metabase/plugins";

import {
  type PreviewTableUsersResponse,
  useGetTableUsersPreviewQuery,
} from "../api";

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
  preHeaderContent,
}: TableUsersPreviewProps) {
  const { data, isFetching, error } = useGetTableUsersPreviewQuery(tableId);
  const [whyTarget, setWhyTarget] = useState<WhyTarget | null>(null);

  return (
    <>
      <PermissionsEditor
        isLoading={isFetching && !data}
        error={error ? t`Couldn't load the preview` : undefined}
        title={data ? getTableName(data) : ""}
        description={t`What each user gets from all their groups combined. Click a value for why.`}
        filterPlaceholder={t`Search for a user`}
        columns={[
          { name: t`User` },
          ...TABLE_COLUMNS.map((column) => ({
            name: getPreviewColumnName(column),
          })),
        ]}
        entities={data ? getEntities(data, setWhyTarget) : []}
        onChange={_.noop}
        preHeaderContent={preHeaderContent}
      />
      <WhySidesheet target={whyTarget} onClose={() => setWhyTarget(null)} />
    </>
  );
}

function getTableName({ table }: PreviewTableUsersResponse) {
  return table.display_name ?? table.name;
}

function getEntities(
  data: PreviewTableUsersResponse,
  onWhy: (target: WhyTarget) => void,
): PermissionEditorEntity[] {
  const tableName = getTableName(data);
  return data.users.map(({ principal, access }) => ({
    id: principal.id,
    name: principal.name,
    hint: principal.detail,
    permissions: TABLE_COLUMNS.map((column) =>
      getWhySection(
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
      ),
    ),
  }));
}

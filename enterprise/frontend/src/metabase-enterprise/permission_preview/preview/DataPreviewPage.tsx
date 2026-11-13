import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
} from "metabase/admin/permissions/components/PermissionsEditor";
import { skipToken } from "metabase/api";
import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
import type {
  EntityView,
  PermissionEditorBreadcrumb,
  PermissionEditorEntity,
  PermissionEditorType,
} from "metabase/permissions";
import { useNavigate, useParams } from "metabase/router";
import { List, Text } from "metabase/ui";

import {
  type PreviewDataResponse,
  type PreviewDatabase,
  type PreviewTableAccess,
  type Principal,
  useGetDataPreviewQuery,
} from "../api";

import { PreviewSidebar } from "./PreviewSidebar";
import { PrincipalHeader, getWhoName } from "./PrincipalHeader";
import { WhySidesheet, type WhyTarget, getWhySection } from "./WhySidesheet";
import {
  type PreviewColumn,
  getPreviewColumnName,
  getPreviewSection,
} from "./preview-options";
import {
  type PreviewRouteParams,
  getDataPreviewUrl,
  getPreviewUrl,
  parsePrincipal,
  parsePrincipalType,
} from "./urls";
import { useRememberPrincipal } from "./use-remember-principal";

const DATA_VIEWS: EntityView[] = ["group", "database"];

const TABLE_COLUMNS = [
  "view_data",
  "create_queries",
  "download_results",
  "manage_table_metadata",
] as const satisfies readonly PreviewColumn[];

type TableColumn = (typeof TABLE_COLUMNS)[number];

const DATABASE_COLUMNS: PreviewColumn[] = [
  ...TABLE_COLUMNS,
  "manage_database",
  "transforms",
];

/** Data › Preview: what a user, a group or a tenant can do with each database, schema and table. */
export function DataPreviewPage() {
  const params = useParams<PreviewRouteParams>();
  const navigate = useNavigate();
  const principalType = parsePrincipalType(params);
  const principal = parsePrincipal(params);
  const databaseId =
    params.databaseId != null ? Number(params.databaseId) : undefined;
  const schemaName = params.schemaName;
  const [whyTarget, setWhyTarget] = useState<WhyTarget | null>(null);

  const { data, isFetching, error } = useGetDataPreviewQuery(
    principal ?? skipToken,
  );

  useRememberPrincipal("data", principal, params.principalType == null);

  const editor =
    principal && data
      ? getEditor({
          data,
          principal,
          databaseId,
          schemaName,
          onNavigate: navigate,
          onWhy: setWhyTarget,
        })
      : null;

  return (
    <>
      <PreviewSidebar
        principalType={principalType}
        principal={principal}
        entityViews={DATA_VIEWS}
        onEntityChange={(view) =>
          navigate(`${getPermissionsBasePath()}/data/${view}`)
        }
        onPrincipalTypeChange={(type) =>
          navigate(getPreviewUrl("data", { type }))
        }
        onPrincipalChange={(principal) =>
          navigate(getDataPreviewUrl(principal, databaseId, schemaName))
        }
      />
      {!principal && (
        <PermissionsEditorEmptyState
          icon="eye"
          message={t`Select a user, a group or a tenant to preview their access`}
        />
      )}
      {principal && (
        <PermissionsEditor
          isLoading={isFetching && !data}
          error={error ? t`Couldn't load the preview` : undefined}
          title={editor?.title ?? ""}
          filterPlaceholder={editor?.filterPlaceholder ?? ""}
          columns={editor?.columns ?? []}
          entities={editor?.entities ?? []}
          breadcrumbs={editor?.breadcrumbs}
          onBreadcrumbsItemSelect={(item) => item.url && navigate(item.url)}
          onSelect={(entity) => editor?.onSelect(entity)}
          onChange={_.noop}
          preHeaderContent={
            data
              ? () => (
                  <PrincipalHeader
                    principal={data.principal}
                    hint={t`What they get from all their groups combined. Click a value for why.`}
                  />
                )
              : undefined
          }
          postHeaderContent={
            editor?.reasons.length
              ? () => <RoutingReasons reasons={editor.reasons} />
              : undefined
          }
        />
      )}
      <WhySidesheet target={whyTarget} onClose={() => setWhyTarget(null)} />
    </>
  );
}

function RoutingReasons({ reasons }: { reasons: string[] }) {
  return (
    <List mt="sm">
      {reasons.map((reason) => (
        <List.Item key={reason}>
          <Text>{reason}</Text>
        </List.Item>
      ))}
    </List>
  );
}

type GetEditorOptions = {
  data: PreviewDataResponse;
  principal: Principal;
  databaseId: number | undefined;
  schemaName: string | undefined;
  onNavigate: (url: string) => void;
  onWhy: (target: WhyTarget) => void;
};

type PreviewEditor = PermissionEditorType & {
  breadcrumbs: PermissionEditorBreadcrumb[];
  reasons: string[];
  onSelect: (entity: PermissionEditorEntity) => void;
};

function getEditor(options: GetEditorOptions): PreviewEditor {
  const { data, principal, databaseId, schemaName } = options;
  const database = data.databases.find(({ id }) => id === databaseId);

  if (database == null) {
    return getDatabasesEditor(options);
  }

  const schemaNames = getSchemaNames(database);
  const hasSchemas = schemaNames.length > 1;

  if (hasSchemas && schemaName == null) {
    return getSchemasEditor(options, database, schemaNames);
  }

  const tables = hasSchemas
    ? database.tables.filter((table) => table.schema === schemaName)
    : database.tables;

  const breadcrumbs: PermissionEditorBreadcrumb[] = [
    { text: t`Databases`, url: getDataPreviewUrl(principal) },
    {
      id: database.id,
      text: database.name,
      url: getDataPreviewUrl(principal, database.id),
    },
    ...(hasSchemas && schemaName != null ? [{ text: schemaName }] : []),
  ];

  return {
    title: t`Access to`,
    filterPlaceholder: t`Search for a table`,
    columns: getColumns(t`Table name`, TABLE_COLUMNS),
    entities: tables.map((table) => getTableEntity(options, database, table)),
    breadcrumbs,
    reasons: database.reasons,
    onSelect: () => undefined,
  };
}

function getTableEntity(
  { data, onWhy }: GetEditorOptions,
  database: PreviewDatabase,
  table: PreviewTableAccess,
): PermissionEditorEntity {
  const tableName = table.display_name ?? table.name;
  return {
    id: table.id,
    name: tableName,
    permissions: TABLE_COLUMNS.map((column) =>
      getWhySection(
        {
          title: `${tableName} · ${getPreviewColumnName(column)}`,
          who: getWhoName(data.principal),
          subject: {
            label: t`Table`,
            value: `${database.name} / ${tableName}`,
          },
          column,
          cell: table[column],
          security: table.security,
        },
        onWhy,
      ),
    ),
  };
}

function getDatabasesEditor({
  data,
  principal,
  onNavigate,
  onWhy,
}: GetEditorOptions): PreviewEditor {
  return {
    title: t`Databases`,
    filterPlaceholder: t`Search for a database`,
    columns: getColumns(t`Database name`, DATABASE_COLUMNS),
    entities: data.databases.map((database) => {
      const openDatabase = () =>
        onNavigate(getDataPreviewUrl(principal, database.id));
      const databaseCell = (column: "manage_database" | "transforms") =>
        getWhySection(
          {
            title: `${database.name} · ${getPreviewColumnName(column)}`,
            who: getWhoName(data.principal),
            subject: { label: t`Database`, value: database.name },
            column,
            cell: database[column],
            security: null,
          },
          onWhy,
        );
      return {
        id: database.id,
        name: database.name,
        canSelect: true,
        permissions: [
          ...TABLE_COLUMNS.map((column) =>
            getPreviewSection(
              column,
              getSummaryValue(database.tables, column),
              openDatabase,
            ),
          ),
          databaseCell("manage_database"),
          databaseCell("transforms"),
        ],
      };
    }),
    breadcrumbs: [],
    reasons: [],
    onSelect: (entity) =>
      typeof entity.id === "number" &&
      onNavigate(getDataPreviewUrl(principal, entity.id)),
  };
}

function getSchemasEditor(
  { principal, onNavigate }: GetEditorOptions,
  database: PreviewDatabase,
  schemaNames: string[],
): PreviewEditor {
  const openSchema = (schemaName: string) =>
    onNavigate(getDataPreviewUrl(principal, database.id, schemaName));
  return {
    title: t`Access to`,
    filterPlaceholder: t`Search for a schema`,
    columns: getColumns(t`Schema name`, TABLE_COLUMNS),
    entities: schemaNames.map((schemaName) => {
      const tables = database.tables.filter(
        (table) => table.schema === schemaName,
      );
      return {
        id: schemaName,
        name: schemaName,
        canSelect: true,
        permissions: TABLE_COLUMNS.map((column) =>
          getPreviewSection(column, getSummaryValue(tables, column), () =>
            openSchema(schemaName),
          ),
        ),
      };
    }),
    breadcrumbs: [
      { text: t`Databases`, url: getDataPreviewUrl(principal) },
      { id: database.id, text: database.name },
    ],
    reasons: database.reasons,
    onSelect: (entity) => openSchema(String(entity.id)),
  };
}

function getColumns(nameColumn: string, columns: readonly PreviewColumn[]) {
  return [
    { name: nameColumn },
    ...columns.map((column) => ({ name: getPreviewColumnName(column) })),
  ];
}

function getSchemaNames(database: PreviewDatabase): string[] {
  return _.uniq(
    database.tables.flatMap((table) =>
      table.schema != null ? [table.schema] : [],
    ),
  );
}

/** One value when every table agrees, else `null`, which the grid shows as "Granular". */
function getSummaryValue(
  tables: PreviewTableAccess[],
  column: TableColumn,
): string | null {
  const values = _.uniq(tables.map((table) => table[column].value));
  return values.length === 1 ? values[0] : null;
}

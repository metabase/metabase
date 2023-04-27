import React from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";
import {
  DatabaseId,
  FieldId,
  Schema,
  SchemaId,
  TableId,
} from "metabase-types/api";
import Database from "metabase-lib/metadata/Database";
import Table from "metabase-lib/metadata/Table";
import Field from "metabase-lib/metadata/Field";
import MetadataBackButton from "../MetadataBackButton";

interface FieldSidebarProps {
  databaseId: DatabaseId;
  schemaId: SchemaId;
  tableId: TableId;
  fieldId: FieldId;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const FieldSidebar = ({
  databaseId,
  schemaId,
  tableId,
  fieldId,
}: FieldSidebarProps) => {
  return (
    <div>
      <div className="flex align-center mb2">
        <MetadataBackButton
          selectedDatabaseId={databaseId}
          selectedSchemaId={schemaId}
          selectedTableId={tableId}
        />
      </div>
      <LeftNavPane>
        <LeftNavPaneItem
          name={t`General`}
          path={Urls.dataModelField(databaseId, schemaId, tableId, fieldId)}
          index
        />
        <LeftNavPaneItem
          name={t`Formatting`}
          path={Urls.dataModelFieldFormatting(
            databaseId,
            schemaId,
            tableId,
            fieldId,
          )}
        />
      </LeftNavPane>
    </div>
  );
};

interface FieldBreadcrumbsProps {
  database: Database;
  schema: Schema;
  table: Table;
  field: Field;
  hasMultipleSchemas: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const FieldBreadcrumbs = ({
  database,
  schema,
  table,
  field,
  hasMultipleSchemas,
}: FieldBreadcrumbsProps) => {
  return (
    <div className="mb4 pt2 ml-auto mr-auto">
      <Breadcrumbs
        crumbs={[
          [database.displayName(), Urls.dataModelDatabase(database.id)],
          ...(hasMultipleSchemas
            ? [[schema.name, Urls.dataModelSchema(database.id, schema.id)]]
            : []),
          [
            table.displayName(),
            Urls.dataModelTable(database.id, schema.id, table.id),
          ],
          t`${field.displayName()} – Field Settings`,
        ]}
      />
    </div>
  );
};
